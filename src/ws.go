package main

import (
	"net/http"
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

		// WebSocket handler function (goroutine)
		go func(client *websocket.Conn) {

			// Configure the client web socket connection
			client.SetReadDeadline(time.Now().Add(readDeadLine))
			client.SetReadLimit(readLimit)

			for {
				var message WebSocketMessage
				err := client.ReadJSON(&message)
				//_, messageBytes, err := client.ReadMessage()
				if err != nil {
					onError(client, err)
					client.Close()
					break
				} else {
					//onMessage(client, messageBytes)
					onMessage(client, message)
				}
			}

		}(upgradedConnection)

	})

}
