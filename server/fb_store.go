package main

import (
	"fmt"
	"math"
	"sort"

	fbClient "github.com/mattermost/focalboard/server/client"
	fbModel "github.com/mattermost/focalboard/server/model"
	"github.com/pkg/errors"

	"github.com/mattermost/mattermost-server/v6/model"
	"github.com/mattermost/mattermost-server/v6/plugin"
)

const (
	// StoreBoardToUserKey is the key used to map a chanel ID to a board ID
	StorChannelToBoardKey = "channel_to_board"

	StatusUpNext  = "Up Next"
	StatusDone    = "Done"
	StatusRevisit = "Revisit"
)

type FocalboardStore interface {
	GetBoard(channelID string, creatorUserID string) (*fbModel.Board, error)
	AddCard(userID string, channelID string, title string) (*fbModel.Block, error)
	GetUpnextCards(userID string, channelID string) ([]fbModel.Block, error)
	UpdateCardStatus(userID string, cardID, channelID, status string) error
}

type focalboardStore struct {
	url string
	api plugin.API
}

func NewFocalboardStore(api plugin.API, url string) FocalboardStore {
	return &focalboardStore{
		api: api,
		url: url,
	}
}

func (l *focalboardStore) getClient(userId string) (*fbClient.Client, error) {
	accessToken, appErr := l.api.CreateUserAccessToken(&model.UserAccessToken{
		UserId:      userId,
		Description: "For calls plugin access to focalboard REST API"})

	if appErr != nil {
		return nil, errors.Wrap(appErr, "failed to create access token for user")
	}

	return fbClient.NewClient(l.url, accessToken.Token), nil
}

func channelToBoardKey(channelID string) string {
	return fmt.Sprintf("%s_%s", StorChannelToBoardKey, channelID)
}

func getCardPropertyByName(board *fbModel.Board, name string) map[string]interface{} {
	for _, prop := range board.CardProperties {
		if prop["name"] == name {
			return prop
		}
	}

	return nil
}

func getPropertyOptionByValue(property map[string]interface{}, value string) map[string]interface{} {
	optionInterfaces, ok := property["options"].([]interface{})
	if !ok {
		return nil
	}

	for _, optionInterface := range optionInterfaces {
		option, ok := optionInterface.(map[string]interface{})
		if !ok {
			continue
		}

		if option["value"] == value {
			return option
		}
	}

	return nil
}

func getPropertyValueForCard(block *fbModel.Block, propertyID string) *string {
	if block.Type != fbModel.TypeCard {
		return nil
	}

	properties, ok := block.Fields["properties"].(map[string]interface{})
	if !ok {
		return nil
	}

	value, ok := properties[propertyID].(string)
	if !ok {
		return nil
	}

	return &value
}

func (l *focalboardStore) getBoardIDForChannel(channelID string) (string, error) {
	rawBoardID, appErr := l.api.KVGet(channelToBoardKey(channelID))
	if appErr != nil {
		return "", errors.Wrap(appErr, "unable to get board id from channel id")
	}

	if rawBoardID == nil {
		return "", nil
	}

	return string(rawBoardID), nil
}

func (l *focalboardStore) GetBoard(channelID string, creatorUserID string) (*fbModel.Board, error) {
	return l.getOrCreateBoardForChannel(channelID, creatorUserID)
}

func (l *focalboardStore) getOrCreateBoardForChannel(channelID string, creatorUserID string) (*fbModel.Board, error) {
	boardID, err := l.getBoardIDForChannel(channelID)
	if err != nil {
		return nil, err
	}

	client, err := l.getClient(creatorUserID)
	if err != nil {
		return nil, err
	}

	if boardID == "" {

		// Get Channel
		channel, appErr := l.api.GetChannel(channelID)
		if appErr != nil {
			return nil, errors.Wrap(appErr, "unable to get current Channel")
		}
		if channel == nil {
			return nil, errors.Wrap(appErr, "unable to get current Channe")
		}

		now := model.GetMillis()

		board := &fbModel.Board{
			ID:         model.NewId(),
			TeamID:     channel.TeamId,
			ChannelID:  channel.Id,
			Type:       fbModel.BoardTypeOpen,
			Title:      "Meeting Agenda",
			CreatedBy:  creatorUserID,
			Properties: map[string]interface{}{},
			CardProperties: []map[string]interface{}{
				{
					"id":      model.NewId(),
					"name":    "Created By",
					"type":    "person",
					"options": []interface{}{},
				},
				{
					"id":      model.NewId(),
					"name":    "Created At",
					"type":    "createdTime",
					"options": []interface{}{},
				},
				{
					"id":   model.NewId(),
					"name": "Status",
					"type": "select",
					"options": []map[string]interface{}{
						{
							"id":    model.NewId(),
							"value": StatusUpNext,
							"color": "propColorYellow",
						},
						{
							"id":    model.NewId(),
							"value": StatusDone,
							"color": "propColorGreen",
						},
						{
							"id":    model.NewId(),
							"value": StatusRevisit,
							"color": "propColorRed",
						},
					},
				},
				{
					"id":      model.NewId(),
					"name":    "Post ID",
					"type":    "text",
					"options": []interface{}{},
				},
				{
					"id":      model.NewId(),
					"name":    "Description",
					"type":    "text",
					"options": []interface{}{},
				},
			},
			CreateAt: now,
			UpdateAt: now,
			DeleteAt: 0,
		}

		block := fbModel.Block{
			ID:       model.NewId(),
			Type:     fbModel.TypeView,
			BoardID:  board.ID,
			ParentID: board.ID,
			Schema:   1,
			Fields: map[string]interface{}{
				"viewType":           fbModel.TypeBoard,
				"sortOptions":        []interface{}{},
				"visiblePropertyIds": []interface{}{},
				"visibleOptionIds":   []interface{}{},
				"hiddenOptionIds":    []interface{}{},
				"collapsedOptionIds": []interface{}{},
				"filter": map[string]interface{}{
					"operation": "and",
					"filters":   []interface{}{},
				},
				"cardOrder":          []interface{}{},
				"columnWidths":       map[string]interface{}{},
				"columnCalculations": map[string]interface{}{},
				"kanbanCalculations": map[string]interface{}{},
				"defaultTemplateId":  "",
			},
			Title:    "All",
			CreateAt: now,
			UpdateAt: now,
			DeleteAt: 0,
		}

		boardsAndBlocks := &fbModel.BoardsAndBlocks{Boards: []*fbModel.Board{board}, Blocks: []fbModel.Block{block}}

		boardsAndBlocks, resp := client.CreateBoardsAndBlocks(boardsAndBlocks)
		if resp.Error != nil {
			fmt.Println(resp.StatusCode)
			return nil, errors.Wrap(resp.Error, "unable to create board")
		}
		fmt.Println(resp.StatusCode)
		if boardsAndBlocks == nil {
			return nil, errors.New("no boards or blocks returned")
		}
		if len(boardsAndBlocks.Boards) == 0 {
			return nil, errors.New("no board returned")
		}

		board = boardsAndBlocks.Boards[0]

		member := &fbModel.BoardMember{
			BoardID:     board.ID,
			UserID:      creatorUserID,
			SchemeAdmin: true,
		}

		_, resp = client.AddMemberToBoard(member)
		if resp.Error != nil {
			return nil, errors.Wrap(resp.Error, "unable to add user to board")
		}

		appErr = l.api.KVSet(channelToBoardKey(channelID), []byte(board.ID))
		if appErr != nil {
			return nil, errors.Wrap(appErr, "unable to store board id for user")
		}

		return board, nil
	}

	board, resp := client.GetBoard(boardID, "")
	if resp.Error != nil {
		return nil, errors.Wrap(resp.Error, "unable to get board by id")
	}

	return board, nil
}

func (l *focalboardStore) getBoardForChannel(userID, channelID string) (*fbModel.Board, error) {
	boardID, err := l.getBoardIDForChannel(channelID)
	if err != nil {
		return nil, err
	}

	if boardID == "" {
		return nil, nil
	}

	client, err := l.getClient(userID)
	if err != nil {
		return nil, err
	}

	board, resp := client.GetBoard(boardID, "")
	if resp.Error != nil {
		return nil, errors.Wrap(resp.Error, "unable to get board by id")
	}

	return board, nil
}

func (l *focalboardStore) getBlock(userID, boardID, blockID string) (*fbModel.Block, error) {
	client, err := l.getClient(userID)
	if err != nil {
		return nil, err
	}

	blocks, resp := client.GetAllBlocksForBoard(boardID)
	if resp.Error != nil {
		return nil, errors.Wrap(resp.Error, "unable to get blocks")
	}

	for _, b := range blocks {
		if b.ID == blockID {
			return &b, nil
		}
	}
	return nil, nil
}

func (l *focalboardStore) AddCard(userID string, channelID string, title string) (*fbModel.Block, error) {
	board, err := l.getOrCreateBoardForChannel(channelID, userID)
	if err != nil {
		return nil, err
	}

	statusProp := getCardPropertyByName(board, "Status")
	if statusProp == nil {
		return nil, errors.New("status card property not found on board")
	}

	creator := userID
	optionTitle := StatusUpNext

	statusOption := getPropertyOptionByValue(statusProp, optionTitle)
	if statusOption == nil {
		return nil, errors.New("option not found on status card property")
	}

	createdByProp := getCardPropertyByName(board, "Created By")
	if createdByProp == nil {
		return nil, errors.New("created by card property not found on board")
	}

	now := model.GetMillis()

	card := fbModel.Block{
		BoardID:   board.ID,
		Type:      fbModel.TypeCard,
		Title:     title,
		CreatedBy: creator,
		Fields: map[string]interface{}{
			"icon": "📋",
			"properties": map[string]interface{}{
				statusProp["id"].(string):    statusOption["id"],
				createdByProp["id"].(string): creator,
			},
		},
		CreateAt: now,
		UpdateAt: now,
		DeleteAt: 0,
	}

	client, err := l.getClient(userID)
	if err != nil {
		return nil, err
	}

	blocks, resp := client.InsertBlocks(board.ID, []fbModel.Block{card}, false)
	if resp.Error != nil {
		return nil, resp.Error
	}

	if len(blocks) != 1 {
		return nil, errors.New("blocks not inserted correctly")
	}

	return &blocks[0], nil
}

func (l *focalboardStore) GetUpnextCards(userID, channelID string) ([]fbModel.Block, error) {
	client, err := l.getClient(userID)
	if err != nil {
		return nil, err
	}

	board, err := l.getBoardForChannel(userID, channelID)
	if err != nil {
		return nil, err
	}

	if board == nil {
		return nil, nil
	}

	blocks, resp := client.GetAllBlocksForBoard(board.ID)
	if resp.Error != nil {
		return nil, errors.Wrap(resp.Error, "unable to get blocks for board")
	}

	statusProp := getCardPropertyByName(board, "Status")
	if statusProp == nil {
		return nil, errors.New("status card property not found on board")
	}

	upNextOption := getPropertyOptionByValue(statusProp, StatusUpNext)
	if upNextOption == nil {
		return nil, errors.New("to do option not found on status card property")
	}

	upNextCards := []fbModel.Block{}

	var cardOrder []string
	for _, b := range blocks {
		if b.Type == fbModel.TypeView {
			cardOrderInt := b.Fields["cardOrder"].([]interface{})
			cardOrder = make([]string, len(cardOrderInt))
			for index, strInt := range cardOrderInt {
				cardOrder[index] = strInt.(string)
			}
			continue
		}

		status := getPropertyValueForCard(&b, statusProp["id"].(string))
		if status == nil {
			continue
		}

		if upNextOption["id"].(string) == *status {
			upNextCards = append(upNextCards, b)
		}
	}

	fmt.Printf("%v\n", upNextCards)

	if cardOrder != nil {
		sort.Slice(upNextCards, func(i, j int) bool {
			return indexForSorting(cardOrder, upNextCards[i].ID) < indexForSorting(cardOrder, upNextCards[j].ID)
		})
	}

	return upNextCards, nil
}

func (l *focalboardStore) UpdateCardStatus(userID, cardID, channelID, status string) error {
	board, err := l.getBoardForChannel(userID, channelID)
	if err != nil {
		return errors.Wrap(err, "unable to get board")
	}

	if board == nil {
		return errors.New("unable to find board")
	}

	block, err := l.getBlock(userID, board.ID, cardID)
	if err != nil {
		return errors.Wrap(err, "unable to get block to update status")
	}
	if block == nil {
		return errors.New("unable to find block to update")
	}

	statusProp := getCardPropertyByName(board, "Status")
	if statusProp == nil {
		return errors.New("status card property not found on board")
	}
	statusID := statusProp["id"].(string)

	newOption := getPropertyOptionByValue(statusProp, status)
	if newOption == nil {
		return errors.New("new option not found on status card property")
	}
	newID := newOption["id"].(string)

	properties, ok := block.Fields["properties"].(map[string]interface{})
	if !ok {
		return errors.New("unable to get block properties")
	}
	properties[statusID] = newID

	patch := &fbModel.BlockPatch{
		UpdatedFields: map[string]interface{}{
			"properties": properties,
		},
	}

	client, err := l.getClient(userID)
	if err != nil {
		return err
	}

	_, resp := client.PatchBlock(board.ID, block.ID, patch, false)
	if resp.Error != nil {
		return errors.Wrap(err, "unable to patch block")
	}

	return nil
}

func indexForSorting(strSlice []string, str string) int {
	for i := range strSlice {
		if strSlice[i] == str {
			return i
		}
	}
	return math.MaxInt
}
