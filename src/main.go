package main

import (
	"encoding/json"
	"flag"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

var (
	app = NewChatApp()
	// Flags
	appPort = flag.String("port", "8080", "Application port")
	appPath = flag.String("path", "", "Path to app dir")

	// Paths
	indexPath string
	staticDir string
)

func init() {

	flag.Parse()

	if *appPath == "" {
		cwd, _ := os.Getwd()
		*appPath = cwd
		indexPath = filepath.Join(*appPath, "web", "index.html")
		staticDir = filepath.Join(*appPath, "web", "static")

	} else {
		indexPath = filepath.Join(*appPath, "src", "web", "index.html")
		staticDir = filepath.Join(*appPath, "src", "web", "static")
	}

}

func main() {

	router := mux.NewRouter()
	router.HandleFunc("/", handleIndex).Methods("GET")
	router.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir(staticDir))))
	HandleWebSocket("/ws", router, onMessage, onError)

	log.Println("Chat server running on port", *appPort)
	log.Fatal(http.ListenAndServe(":"+*appPort, router))
}

func handleIndex(w http.ResponseWriter, r *http.Request) {
	byteData, err := ioutil.ReadFile(indexPath)
	if err != nil {
		panic(err)
	}
	w.Write(byteData)
}

func onMessage(c *websocket.Conn, message WebSocketMessage) {
	log.Println("onMessage", message)

	switch message.Type {

	case "create-user":
		if ok := app.CreateUser(strings.ToUpper(message.Body), c); ok {
			response := WebSocketMessage{"create-user", "OK"}
			c.WriteJSON(response)
			return
		}
		response := WebSocketMessage{"create-user", "NOT OK"}
		c.WriteJSON(response)

	case "get-rooms":
		roomNames := []string{}
		for _, room := range app.Rooms {
			roomNames = append(roomNames, room.Name)
		}
		byteData, _ := json.Marshal(roomNames)
		response := WebSocketMessage{"get-rooms", string(byteData)}
		c.WriteJSON(response)

	case "join-room":
		if user, found := app.FindUserByConn(c); found {
			for index, room := range app.Rooms {
				if room.Name == message.Body {
					user.Room = room
					app.Rooms[index].Users = append(app.Rooms[index].Users, user)
					response := WebSocketMessage{"join-room", "OK"}
					c.WriteJSON(response)
					name := strings.Title(strings.ToLower(user.Name))
					room.MessageQueue <- NewChatMessage("SERVER", name+" has joined the chat!")
					return
				}
			}
		}
		response := WebSocketMessage{"join-room", "NOT OK"}
		c.WriteJSON(response)

	case "send":
		if user, found := app.FindUserByConn(c); found {
			if user.Room != nil {
				name := strings.Title(strings.ToLower(user.Name))
				user.Room.MessageQueue <- NewChatMessage(name, message.Body)
			}
		}

	case "typing":
		if user, found := app.FindUserByConn(c); found {
			if user.Room != nil {
				name := strings.Title(strings.ToLower(user.Name))
				user.Room.TypingQueue <- &ChatRoomTyper{name, message.Body == "true"}
			}
		}

	}
}

func onError(c *websocket.Conn, err error) {
	log.Println("onError", err.Error())
	if user, found := app.FindUserByConn(c); found {
		if user.Room != nil {
			name := strings.Title(strings.ToLower(user.Name))
			user.Room.MessageQueue <- NewChatMessage("SERVER", name+" has left the chat.")
			if removed := app.RemoveUserByConn(c); !removed {
				log.Println("Could not remove user. Connection not found!")
			}
		}
	}
}
