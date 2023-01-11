package ws

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/mattermost/mattermost-server/v6/model"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/vmihailenco/msgpack/v5"
)

func dummyWebsocketHandler(t *testing.T, wg *sync.WaitGroup) http.HandlerFunc {
	return func(w http.ResponseWriter, req *http.Request) {
		defer wg.Done()
		upgrader := &websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		}
		conn, err := upgrader.Upgrade(w, req, nil)
		require.Nil(t, err)
		var buf []byte
		for {
			_, buf, err = conn.ReadMessage()
			if err != nil {
				break
			}
			t.Logf("%s\n", buf)
			err = conn.WriteMessage(websocket.TextMessage, []byte("hello world"))
			if err != nil {
				break
			}
		}
	}
}

// TestClose verifies that the client is properly and safely closed in all possible ways.
func TestClose(t *testing.T) {
	var wg sync.WaitGroup
	s := httptest.NewServer(dummyWebsocketHandler(t, &wg))
	defer func() {
		wg.Wait()
		s.Close()
	}()

	checkEventChan := func(eventChan chan *model.WebSocketEvent) {
		defer func() {
			if x := recover(); x == nil {
				require.Fail(t, "should have panicked due to closing a closed channel")
			}
		}()
		close(eventChan)
	}

	t.Run("Sudden", func(t *testing.T) {
		wg.Add(1)
		url := strings.Replace(s.URL, "http://", "ws://", 1)
		c, err := NewClient(&ClientParams{
			WsURL:     url,
			AuthToken: "authToken",
		})
		require.Nil(t, err)

		go func() {
			// Just drain the event channel
			for range c.EventChannel {
			}
		}()

		err = c.SendMessage("test_action", map[string]interface{}{"test": "data"})
		assert.Nil(t, err)

		err = c.conn.Close()
		assert.Nil(t, err)

		// wait for a while for reader to exit
		time.Sleep(200 * time.Millisecond)

		// Verify that event channel is closed.
		checkEventChan(c.EventChannel)
	})

	t.Run("Normal", func(t *testing.T) {
		wg.Add(1)
		url := strings.Replace(s.URL, "http://", "ws://", 1)
		c, err := NewClient(&ClientParams{
			WsURL:     url,
			AuthToken: "authToken",
		})
		require.Nil(t, err)

		go func() {
			// Just drain the event channel
			for range c.EventChannel {
			}
		}()

		err = c.SendMessage("test_action", map[string]interface{}{"test": "data"})
		assert.Nil(t, err)

		c.Close()

		// Verify that event channel is closed.
		checkEventChan(c.EventChannel)
	})

	t.Run("Concurrent", func(t *testing.T) {
		wg.Add(1)
		url := strings.Replace(s.URL, "http://", "ws://", 1)
		c, err := NewClient(&ClientParams{
			WsURL:     url,
			AuthToken: "authToken",
		})
		require.Nil(t, err)

		go func() {
			// Just drain the event channel
			for range c.EventChannel {
			}
		}()

		err = c.SendMessage("test_action", map[string]interface{}{"test": "data"})
		assert.Nil(t, err)

		var wg2 sync.WaitGroup
		wg2.Add(2)
		go func() {
			defer wg2.Done()
			c.Close()
		}()

		go func() {
			defer wg2.Done()
			c.conn.Close()
		}()

		wg2.Wait()
		// Verify that event channel is closed.
		checkEventChan(c.EventChannel)
	})
}

// TestSendMessage verifies that there are no races or panics during message send
// in various conditions.
func TestSendMessage(t *testing.T) {
	var wg sync.WaitGroup
	s := httptest.NewServer(dummyWebsocketHandler(t, &wg))
	defer func() {
		wg.Wait()
		s.Close()
	}()

	t.Run("SendAfterSuddenClose", func(t *testing.T) {
		wg.Add(1)
		url := strings.Replace(s.URL, "http://", "ws://", 1)
		c, err := NewClient(&ClientParams{
			WsURL:     url,
			AuthToken: "authToken",
		})
		require.Nil(t, err)

		go func() {
			// Just drain the event channel
			for range c.EventChannel {
			}
		}()

		err = c.SendMessage("test_action", map[string]interface{}{"test": "data"})
		assert.Nil(t, err)

		err = c.conn.Close()
		assert.Nil(t, err)

		err = c.SendMessage("test_action", map[string]interface{}{"test": "data"})
		assert.NotNil(t, err)
	})

	t.Run("SendAfterClose", func(t *testing.T) {
		wg.Add(1)
		url := strings.Replace(s.URL, "http://", "ws://", 1)
		c, err := NewClient(&ClientParams{
			WsURL:     url,
			AuthToken: "authToken",
		})
		require.Nil(t, err)

		go func() {
			// Just drain the event channel
			for range c.EventChannel {
			}
		}()

		err = c.SendMessage("test_action", map[string]interface{}{"test": "data"})
		assert.Nil(t, err)

		c.Close()

		err = c.SendMessage("test_action", map[string]interface{}{"test": "data"})
		assert.NotNil(t, err)
	})

	t.Run("SendDuringSuddenClose", func(t *testing.T) {
		wg.Add(1)
		url := strings.Replace(s.URL, "http://", "ws://", 1)
		c, err := NewClient(&ClientParams{
			WsURL:     url,
			AuthToken: "authToken",
		})
		require.Nil(t, err)

		go func() {
			// Just drain the event channel
			for range c.EventChannel {
			}
		}()

		err = c.SendMessage("test_action", map[string]interface{}{"test": "data"})
		assert.Nil(t, err)

		go func() {
			_ = c.SendMessage("test_action", map[string]interface{}{"test": "data"})
		}()

		err = c.conn.Close()
		assert.Nil(t, err)
	})

	t.Run("SendDuringClose", func(t *testing.T) {
		wg.Add(1)
		url := strings.Replace(s.URL, "http://", "ws://", 1)
		c, err := NewClient(&ClientParams{
			WsURL:     url,
			AuthToken: "authToken",
		})
		require.Nil(t, err)

		go func() {
			// Just drain the event channel
			for range c.EventChannel {
			}
		}()

		err = c.SendMessage("test_action", map[string]interface{}{"test": "data"})
		assert.Nil(t, err)

		go func() {
			_ = c.SendMessage("test_action", map[string]interface{}{"test": "data"})
		}()

		c.Close()
	})
}

func TestSendBinaryMessage(t *testing.T) {
	var wg sync.WaitGroup
	inputData := map[string]interface{}{
		"data": "testing binary data",
	}

	wsHandler := func(w http.ResponseWriter, req *http.Request) {
		defer wg.Done()
		upgrader := &websocket.Upgrader{}
		conn, err := upgrader.Upgrade(w, req, nil)
		require.NoError(t, err)
		for {
			msgType, buf, err := conn.ReadMessage()
			if err != nil {
				break
			}
			require.Equal(t, websocket.BinaryMessage, msgType)
			var outputData map[string]interface{}
			err = msgpack.Unmarshal(buf, &outputData)
			require.NoError(t, err)
			require.Equal(t, "test_action", outputData["action"])
			require.Equal(t, inputData, outputData["data"])
		}
	}

	wg.Add(1)
	s := httptest.NewServer(http.HandlerFunc(wsHandler))
	defer func() {
		wg.Wait()
		s.Close()
	}()

	url := strings.Replace(s.URL, "http://", "ws://", 1)
	c, err := NewClient(&ClientParams{
		WsURL:     url,
		AuthToken: "authToken",
	})
	require.Nil(t, err)

	err = c.SendBinaryMessage("test_action", inputData)
	require.NoError(t, err)
	c.Close()
}
