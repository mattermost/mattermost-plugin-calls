package ws

import (
	"bytes"
	"fmt"
	"net/http"
	"sync"

	"github.com/mattermost/mattermost-server/v6/model"
	"github.com/mattermost/mattermost-server/v6/shared/mlog"

	"github.com/gorilla/websocket"
	"github.com/vmihailenco/msgpack/v5"
)

const avgReadMsgSizeBytes = 1024

// Client is the websocket client to perform all actions.
type Client struct {
	EventChannel chan *model.WebSocketEvent

	conn      *websocket.Conn
	authToken string
	sequence  int64
	readWg    sync.WaitGroup
	writeMut  sync.RWMutex
}

type ClientParams struct {
	WsURL          string
	AuthToken      string
	ConnID         string
	ServerSequence int64
}

// NewClient constructs a new WebSocket client.
func NewClient(param *ClientParams) (*Client, error) {
	header := http.Header{
		"Authorization": []string{"Bearer " + param.AuthToken},
	}

	url := param.WsURL + model.APIURLSuffix + "/websocket" + fmt.Sprintf("?connection_id=%s&sequence_number=%d", param.ConnID, param.ServerSequence)
	conn, _, err := websocket.DefaultDialer.Dial(url, header)
	if err != nil {
		return nil, err
	}

	client := &Client{
		EventChannel: make(chan *model.WebSocketEvent, 100),

		conn:      conn,
		authToken: param.AuthToken,
		sequence:  1,
	}

	client.readWg.Add(1)
	go client.reader()

	return client, nil
}

// Close closes the client.
func (c *Client) Close() {
	// If Close gets called concurrently during the time
	// a connection-break happens, this will become a no-op.
	c.conn.Close()
	// Wait for reader to return.
	// If the reader has already quit, this will just fall-through.
	c.readWg.Wait()
}

func (c *Client) reader() {
	defer func() {
		close(c.EventChannel)
		// Mark wg as Done.
		c.readWg.Done()
	}()

	var buf bytes.Buffer
	buf.Grow(avgReadMsgSizeBytes)

	for {
		// Reset buffer.
		buf.Reset()
		_, r, err := c.conn.NextReader()
		if err != nil {
			if !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseNoStatusReceived) {
				// log error
				mlog.Debug("error from conn.NextReader", mlog.Err(err))
			}
			return
		}
		// Use pre-allocated buffer.
		_, err = buf.ReadFrom(r)
		if err != nil {
			if !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseNoStatusReceived) {
				// log error
				mlog.Warn("error from buf.ReadFrom", mlog.Err(err))
			}
			return
		}

		event, err := model.WebSocketEventFromJSON(&buf)
		if event == nil || err != nil {
			continue
		}
		if event.IsValid() {
			// non-blocking send in case event channel is full.
			select {
			case c.EventChannel <- event:
			default:
			}
		}
	}
}

// SendMessage is the method to write to the websocket.
func (c *Client) SendMessage(action string, data map[string]interface{}) error {
	// It uses a mutex to synchronize writes.
	// Intentionally no atomics are used to perform additional state tracking.
	// Therefore, we let it fail if the user tries to write again on a closed connection.
	c.writeMut.Lock()
	defer c.writeMut.Unlock()

	req := &model.WebSocketRequest{
		Seq:    c.sequence,
		Action: action,
		Data:   data,
	}

	c.sequence++
	return c.conn.WriteJSON(req)
}

// SendBinaryMessage is the method to write to the websocket using binary data type
// (MessagePack encoded).
func (c *Client) SendBinaryMessage(action string, data map[string]interface{}) error {
	req := &model.WebSocketRequest{
		Seq:    c.sequence,
		Action: action,
		Data:   data,
	}

	binaryData, err := msgpack.Marshal(req)
	if err != nil {
		return fmt.Errorf("failed to marshal request to msgpack: %w", err)
	}

	c.writeMut.Lock()
	defer c.writeMut.Unlock()

	c.sequence++
	return c.conn.WriteMessage(websocket.BinaryMessage, binaryData)
}

// Helper utilities that call SendMessage.

func (c *Client) UserTyping(channelId, parentId string) error {
	data := map[string]interface{}{
		"channel_id": channelId,
		"parent_id":  parentId,
	}

	return c.SendMessage("user_typing", data)
}

func (c *Client) GetStatuses() error {
	return c.SendMessage("get_statuses", nil)
}

func (c *Client) GetStatusesByIds(userIds []string) error {
	data := map[string]interface{}{
		"user_ids": userIds,
	}
	return c.SendMessage("get_statuses_by_ids", data)
}
