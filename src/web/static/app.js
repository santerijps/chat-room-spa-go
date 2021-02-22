(() => {

  // Applicatio state enum
  const APPSTATE = {
    INIT: 0,  // Connecting to the websocket
    JOIN: 1,  // Selecting a nickname
    ROOM: 2,  // Selecting a chat room
    CHAT: 3   // Chatting in a chat room
  }

  class ChatApp {

    constructor(state) {
      this.ws = null
      this.views = null
      this.html = E$("div", this.generate(state))
    }

    init(state) {
      state.phaze = APPSTATE.INIT
      state.autoscroll = true
      state.previousSender = null
      state.chatlog = []
      state.nickname = null
      state.room = null
      this.initializeWebSocket(state)
      this.views = {
        nameChooser: new NameChooserComponent(state),
        roomChooser: new RoomChooserComponent(state),
        chatRoom: new ChatRoomComponent(state)
      }
    }

    initializeWebSocket(state) {
  
      this.ws = new WebSocket(
        window.location.protocol === "https:" ? "wss://" : "ws://"
        + document.location.host
        + "/ws"
      )

      this.ws.onopen = event => {
        console.log("WebSocket: Connected to server!")
        state.phaze = APPSTATE.JOIN
        this.update(state)
        document.getElementById("nickname").focus()
      }

      this.ws.onmessage = event => {

        const msg = JSON.parse(event.data)

        switch (msg.Type) {
  
          case "create-user":
            msg.Body === "OK" ? (
              state.phaze = APPSTATE.ROOM,
              this.ws.send(JSON.stringify({Type: "get-rooms"})),
              this.update(state)
            )
            : alert("Nickname is already in use!")
            break

          case "get-rooms":
            state.rooms = JSON.parse(msg.Body)
            this.update(state)
            break

          case "join-room":
            msg.Body === "OK" ? (
              state.phaze = APPSTATE.CHAT,
              this.update(state)
            )
            : alert("Failed to join the chat room!")
            break

          case "send":
            let body = JSON.parse(msg.Body)
            state.chatlog.push(body)
            this.views.chatRoom.update(state)
            document.getElementById("chat-msg").focus()
            state.previousSender = body.Sender
            if (state.autoscroll) {
              document.getElementById("messages").scrollTo({
                top: document.getElementById("messages").scrollHeight,
                behavior: "smooth"
              })
            }
            break

          case "ping":
            console.log("WebSocket: Received PING request!")
            break

        }
      }

      this.ws.onerror = event => {
        console.log("WebSocket: Error occurred!", event)
      }

      this.ws.onclose = event => {
        console.log("WebSocket: Closed connection!", event)
        this.initializeWebSocket(state)
      }

      state.ws = this.ws

    }
  
    generate(state) {
      if (state.phaze === APPSTATE.JOIN) return this.views.nameChooser.html
      else if (state.phaze === APPSTATE.ROOM) return this.views.roomChooser.html
      else if (state.phaze === APPSTATE.CHAT) return this.views.chatRoom.html
      else return E$("p", "Failed to connect to WebSocket... Sorry :(")
    }

    update(state) {
      for (const view in this.views) this.views[view].update(state)
      SETE$(this.html, this.generate(state))
      state.phaze === APPSTATE.ROOM && document.querySelector("select").focus()
    }

  }

  class NameChooserComponent {

    constructor(state) {
      this.html = E$("div", this.generate(state))
    }

    generate(state) {
      return (
        E$("div", {style: "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -100%);"},
          E$("p", 
            E$("b", "Choose your nickname:")
          ),
          E$("p", {style: "font-size: xx-small;"}, "Between 2-15 characters long, alphanumeric characters and underscores allowed."),
          E$("input", {
            type: "text", placeholder: "Enter your nickname here...", style: "display: block; width: 100%;", id: "nickname",
            onkeydown: this.inputKeyDown, maxlength: "15", minlength: "2", pattern: "^\w+$"
          }),
          E$("div", {style: "text-align: right;"},
            E$("button", {style: "margin-top: 10px;", onclick: () => this.tryJoinChat(state)}, "Join the chat!")
          )
        )
      )
    }

    inputKeyDown(event) {
      if (event.key === "Enter") {
        document.querySelector("button").click()
      }
    }

    tryJoinChat(state) {
      const nickname = document.getElementById("nickname").value.trim()
      document.getElementById("nickname").value = ""
      if (nickname.match(/^\w+$/gm) === null) return
      state.nickname = nickname[0].toUpperCase() + nickname.slice(1).toLowerCase()
      if (nickname.length < 2 || nickname.length > 15) return
      state.ws.send(JSON.stringify({
        Type: "create-user",
        Body: nickname,
      }))
    }

    update(state) {
      // do nothing
    }

  }

  class RoomChooserComponent {

    constructor(state) {
      this.html = E$("div", this.generate(state))
    }

    generate(state) {
      return (
        E$("div", {style: "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -100%);"},
          E$("p", 
            E$("b", "Choose which room to join:")
          ),
          E$("select", {style: "display: block;"},
            state.rooms && state.rooms.map(room => E$("option", {value: room}, "Room: " + room))
          ),
          E$("div", {style: "text-align: right;"},
            E$("button", {style: "margin-top: 10px;", onclick: () => this.joinChatRoom(state)}, "Join selected chat room")
          )
        )
      )
    }

    update(state) {
      SETE$(this.html, this.generate(state))
    }

    joinChatRoom(state) {
      state.room = document.querySelector("select").selectedOptions[0].value
      state.ws.send(JSON.stringify({
        Type: "join-room",
        Body: state.room
      }))
    }

  }

  class ChatRoomComponent {

    constructor(state) {
      this.componentIsProper = false
      this.html = E$("div", this.generate(state))
    }

    generate(state) {
      return (
        E$("div", {style: "height: 100%;"},

          // Heading
          E$("div", {style: "margin: 0; height: 10%; box-shadow: 0 0 10px 0 #888888; display: flex;"},
            E$("div", {style: "height: 100%; width: 50%; display: flex; justify-content: center; align-items: center; border-right: 1px solid gainsboro;"},
              E$("h2", {style: "margin: 0;"}, `#${state.room}`)
            ),
            E$("div", {style: "height: 100%; width: 50%; display: flex; justify-content: center; align-items: center;"},
              E$("input", {type: "checkbox", id: "auto-scroll", checked: "true", onchange: event => {
                state.autoscroll = event.target.checked
              }}),
              T$("Toggle automatic scrolling")
            )
          ),

          // Chat log
          E$("div", {style: "height: 80%;"},
            E$("div", {id: "messages", style: "height: 100%; overflow: auto; padding: 0 10px 0 10px;"}
            )
          ),

          // Currently typing people (TODO)
          E$("div", {style: "height: 4%; display: flex; justify-content: center; align-items: center;"},
            E$("p", {style: "color: gainsboro;"}, "Users are typing... (this feature doesn't work yet)")
          ),

          // Chat input
          E$("div", {style: "height: 6%; display: flex;"},
            // Nick name thingy
            E$("div", {style: "height: 100%; width: 10%; border: 1px solid gainsboro; display: flex; justify-content: center; align-items: center;"},
              E$("p", `Say as ${state.nickname}`)
            ),
            // Input text
            E$("div", {style: "height: 100%; width: 90%; display: flex;"},
              E$("input", {type: "text", placeholder: "Enter your message here (Press Enter to send)", style: "height: 100%; width: 100%; margin: 0; padding: 20px; outline: none; border: 0; background-color: gainsboro;", id: "chat-msg", onkeydown: this.inputKeyDown}),
              E$("button", {style: "display: none;", onclick: () => this.sendChatMessage(state)}, "Send")
            )
          )
        )
      )
    }

    inputKeyDown(event) {
      if (event.key === "Enter") {
        document.querySelector("button").click()
      }
    }

    sendChatMessage(state) {
      const msg = document.getElementById("chat-msg").value.trim()
      document.getElementById("chat-msg").value = ""
      if (msg.length === 0) return
      state.ws.send(JSON.stringify({
        Type: "send",
        Body: msg
      }))
    }

    update(state) {
      if (!this.componentIsProper && state.nickname !== null && state.room !== null) {
        this.componentIsProper = true
        SETE$(this.html, this.generate(state))
      }
      for (let i = 0; i < state.chatlog.length; i++) {
        let msg = state.chatlog.shift()
        document.getElementById("messages").appendChild(
          E$("p", {style: `${msg.Sender === state.previousSender ? "margin: 5 0 0 0;" : "margin: 30 0 0 0;"} word-break: break-word;`}, 
            E$("b", 
              E$("span", {style: "color: gray;"}, `[${msg.Timestamp}] `),
              E$("span", `${msg.Sender}: `)
            ),
            T$(msg.Data)
          )
        )
      }
    }

  }

  LOAD$(
    () => console.log("Document loaded, setting up ChatApp..."),
    () => INIT_CLASS$("#app-root", ChatApp)
  )

})()
