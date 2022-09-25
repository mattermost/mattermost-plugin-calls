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
	GetBoardForChannel(token string, channelID string) (*fbModel.Board, error)
	AddCard(userID string, token string, channelID string, title string) (*fbModel.Block, error)
	GetUpnextCards(token string, channelID string) ([]fbModel.Block, error)
	UpdateCardStatus(token string, cardID, channelID, status string) error
	GetClient(token string) *fbClient.Client
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

func (s *focalboardStore) GetClient(token string) *fbClient.Client {
	return fbClient.NewClient(s.url, token)
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

func (s *focalboardStore) GetBoardForChannel(token, channelID string) (*fbModel.Board, error) {
	client := s.GetClient(token)

	channel, err := s.api.GetChannel(channelID)
	if err != nil {
		return nil, err
	}

	boards, resp := client.SearchBoardsForUser(channel.TeamId, "agenda-"+channelID, fbModel.BoardSearchFieldPropertyName)
	if resp.Error != nil {
		return nil, resp.Error
	}

	if len(boards) == 0 {
		return nil, errors.New("no board found for channelID: " + channelID)
	}

	return boards[0], nil
}

func (s *focalboardStore) getBlock(token, boardID, blockID string) (*fbModel.Block, error) {
	client := s.GetClient(token)

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

func (s *focalboardStore) AddCard(userID string, token string, channelID string, title string) (*fbModel.Block, error) {
	board, err := s.GetBoardForChannel(token, channelID)
	if err != nil {
		return nil, err
	}

	statusProp := getCardPropertyByName(board, "Status")
	if statusProp == nil {
		return nil, errors.New("status card property not found on board")
	}

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
		CreatedBy: userID,
		Fields: map[string]interface{}{
			"icon": "📋",
			"properties": map[string]interface{}{
				statusProp["id"].(string):    statusOption["id"],
				createdByProp["id"].(string): userID,
			},
		},
		CreateAt: now,
		UpdateAt: now,
		DeleteAt: 0,
	}

	client := s.GetClient(token)

	blocks, resp := client.InsertBlocks(board.ID, []fbModel.Block{card}, false)
	if resp.Error != nil {
		return nil, resp.Error
	}

	if len(blocks) != 1 {
		return nil, errors.New("blocks not inserted correctly")
	}

	return &blocks[0], nil
}

func (s *focalboardStore) GetUpnextCards(token, channelID string) ([]fbModel.Block, error) {
	client := s.GetClient(token)

	board, err := s.GetBoardForChannel(token, channelID)
	if err != nil {
		return nil, err
	}

	if board == nil {
		return nil, errors.New("board was nil")
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

func (s *focalboardStore) UpdateCardStatus(token, cardID, channelID, status string) error {
	board, err := s.GetBoardForChannel(token, channelID)
	if err != nil {
		return errors.Wrap(err, "unable to get board")
	}

	if board == nil {
		return errors.New("unable to find board")
	}

	block, err := s.getBlock(token, board.ID, cardID)
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

	client := s.GetClient(token)

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
