package main

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

const (
	readDeadLine = time.Hour * 24
	readLimit    = 512
)

// WebSocketMessage represents a message sent between client and server.
type WebSocketMessage struct {
	Type string // "join-request", "chat-message" etc.
	Body string // Actual content of the frame.
}

// ErrorHandler defines the error handler function signature.
type ErrorHandler func(*websocket.Conn, error)

// MessageHandler defines the message handler function signature.
type MessageHandler func(*websocket.Conn, WebSocketMessage)

// HandleWebSocket does the leg word for setting up a web socket connection.
func HandleWebSocket(path string, router *mux.Router, onMessage MessageHandler, onError ErrorHandler) {

	var upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}

	router.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {

		// Try to upgrade the connection
		upgradedConnection, err := upgrader.Upgrade(w, r, nil)

		if err != nil {
			return
		}

		pongChannel := make(chan WebSocketMessage)
		timeToStop := make(chan int)

		// WebSocket handler function (goroutine)
		go func(client *websocket.Conn) {

			// Configure the client web socket connection
			client.SetReadDeadline(time.Now().Add(readDeadLine))
			client.SetReadLimit(readLimit)

			for {
				var message WebSocketMessage
				err := client.ReadJSON(&message)
				if err != nil {
					onError(client, err)
					client.Close()
					timeToStop <- 1
					return
				}
				if message.Type == "pong" {
					pongChannel <- message
				} else {
					onMessage(client, message)
				}
			}

		}(upgradedConnection)

		go func(client *websocket.Conn) {

			// Send pings every 30 seconds
			ticker := time.NewTicker(time.Second * 30)
			var t time.Time
			defer ticker.Stop()

			for {
				select {
				case t = <-ticker.C:
					m := WebSocketMessage{"ping", t.Format("2006/01/02 15:04:05")}
					client.WriteJSON(m)
				case msg := <-pongChannel:
					i, _ := strconv.Atoi(msg.Body)
					if time.Unix(int64(i), 0).Sub(t).Seconds() > 30 {
						onError(client, errors.New("pong took too long"))
						client.Close()
						timeToStop <- 1
					}
				case <-timeToStop:
					return
				}
			}

		}(upgradedConnection)

	})

}
