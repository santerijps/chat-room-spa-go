package main

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

// ChatMessage represents a chat message.
// The message can have many types.
type ChatMessage struct {
	Sender    string
	Data      string
	Timestamp string
}

// NewChatMessage creates a new Message object and sets the timestamp automatically
func NewChatMessage(sender, data string) *ChatMessage {
	return &ChatMessage{
		Sender:    sender,
		Data:      data,
		Timestamp: time.Now().Format("2006/01/02 15:04:05"),
	}
}

// ChatUser represents a chat user.
type ChatUser struct {
	Name string
	Conn *websocket.Conn
	Room *ChatRoom
}

// NewChatUser creates a new chat user.
func NewChatUser(name string, conn *websocket.Conn) *ChatUser {
	return &ChatUser{name, conn, nil}
}

// ChatRoomTyper represents a user typing in a chat
type ChatRoomTyper struct {
	Name   string
	Typing bool
}

// ChatRoom represents a chat room.
type ChatRoom struct {
	Name         string
	Users        []*ChatUser // Users in this specific chat room.
	MessageQueue chan *ChatMessage
	TypingQueue  chan *ChatRoomTyper
}

// NewChatRoom creates a new chat room.
func NewChatRoom(name string) *ChatRoom {
	room := ChatRoom{name, []*ChatUser{}, make(chan *ChatMessage), make(chan *ChatRoomTyper)}
	go ChatRoomBroadcaster(&room)
	return &room
}

// RemoveUserByConn removes a user from a chat room.
func (room *ChatRoom) RemoveUserByConn(conn *websocket.Conn) bool {
	for index, user := range room.Users {
		if user.Conn == conn {
			room.Users[index] = room.Users[len(room.Users)-1]
			room.Users = room.Users[:len(room.Users)-1]
			return true
		}
	}
	return false
}

// ChatRoomBroadcaster is a goroutine that waits for messages in the message queue of a chat room.
func ChatRoomBroadcaster(room *ChatRoom) {
	for {
		select {

		case msg := <-room.MessageQueue:
			Broadcast(room, "send", *msg)

		case typing := <-room.TypingQueue:
			Broadcast(room, "typing", *typing)
		}
	}
}

// Broadcast sends a message to each user in a specified chat room
func Broadcast(room *ChatRoom, _type string, data interface{}) {
	log.Println("Broadcasting to", "#"+room.Name, _type, data)
	byteData, err := json.Marshal(data)
	if err != nil {
		return
	}
	webSocketMessage := WebSocketMessage{_type, string(byteData)}
	for _, user := range room.Users {
		if err := user.Conn.WriteJSON(webSocketMessage); err != nil {
			log.Println("ChatRoomBroadcastError", err.Error())
		}
	}
}

// ChatApp represents a chat app.
type ChatApp struct {
	Rooms []*ChatRoom
	Users []*ChatUser // All users of the app.
}

// NewChatApp initializes a new chat application.
func NewChatApp() *ChatApp {
	app := ChatApp{[]*ChatRoom{}, []*ChatUser{}}
	app.Rooms = append(app.Rooms, NewChatRoom("generic"))
	app.Rooms = append(app.Rooms, NewChatRoom("SuomiFinlandPerkele"))
	return &app
}

// CreateUser tries to create a new user to the application.
// If a user with the same name already exists, the function will return false.
func (app *ChatApp) CreateUser(name string, conn *websocket.Conn) bool {
	if _, found := app.FindUserByName(name); found {
		return false
	}
	user := NewChatUser(name, conn)
	app.Users = append(app.Users, user)
	return true
}

// FindUserByConn looks for a user in the app by conn.
func (app *ChatApp) FindUserByConn(conn *websocket.Conn) (*ChatUser, bool) {
	for _, user := range app.Users {
		if user.Conn == conn {
			return user, true
		}
	}
	return nil, false
}

// FindUserByName looks for a user in the app by name.
func (app *ChatApp) FindUserByName(name string) (*ChatUser, bool) {
	for _, user := range app.Users {
		if user.Name == name {
			return user, true
		}
	}
	return nil, false
}

// RemoveUserByConn removes a user from the app by a websocket connection.
// Can be used when an error occurs, and the user name is not known.
// Returns true if function actually removed a user.
func (app *ChatApp) RemoveUserByConn(conn *websocket.Conn) bool {
	for index, user := range app.Users {
		if user.Conn == conn {
			app.Users[index] = app.Users[len(app.Users)-1]
			app.Users = app.Users[:len(app.Users)-1]
			if user.Room != nil {
				user.Room.RemoveUserByConn(conn)
			}
			return true
		}
	}
	return false
}
