(() => {

  // Applicatio state enum
  const APPSTATE = {
    FAIL: -1, // Failed to connect to websocket
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
      state.typers = []
      this.initializeWebSocket(state)
      this.views = {
        nameChooser: new NameChooserComponent(state),
        roomChooser: new RoomChooserComponent(state),
        chatRoom: new ChatRoomComponent(state)
      }
    }

    initializeWebSocket(state) {

      this.ws = new WebSocket(
        (window.location.protocol === "https:" ? "wss://" : "ws://")
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
              this.ws.send(JSON.stringify({ Type: "get-rooms" })),
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

          case "typing":
            let t = JSON.parse(msg.Body)
            if (t.Typing) {
              t.Name !== state.nickname && state.typers.push(t.Name)
            } else {
              if (t.Name !== state.nickname) {
                let index = state.typers.indexOf(t.Name)
                state.typers.splice(index, 1)
              }
            }
            this.views.chatRoom.update(state)
            break

          case "ping":
            state.ws.send(JSON.stringify({
              Type: "pong",
              Body: ((+ new Date()) / 1000).toString()
            }))
            break

        }
      }

      this.ws.onerror = event => {
        console.log("WebSocket: Error occurred!", event)
      }

      this.ws.onclose = event => {
        console.log("WebSocket: Closed connection!", event)
        state.phaze = APPSTATE.FAIL
        this.update(state)
      }

      state.ws = this.ws

    }

    generate(state) {
      switch (state.phaze) {
        case APPSTATE.FAIL: return E$("p", "Failed to connect to the server! Sorry for the inconvinience!")
        case APPSTATE.INIT: return this.views.loader.html
        case APPSTATE.JOIN: return this.views.nameChooser.html
        case APPSTATE.ROOM: return this.views.roomChooser.html
        case APPSTATE.CHAT: return this.views.chatRoom.html
        default: return E$("p", "Connecting to the server...")
      }
    }

    update(state) {
      for (const view in this.views) this.views[view].update?.(state)
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
        E$("div", { style: "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -100%);" },
          E$("p",
            E$("b", "Choose your nickname:")
          ),
          E$("p", { style: "font-size: xx-small;" }, "Between 2-15 characters long, alphanumeric characters and underscores allowed."),
          E$("input", {
            type: "text", placeholder: "Enter your nickname here...", style: "display: block; width: 100%;", id: "nickname",
            onkeydown: this.inputKeyDown, maxlength: "15", minlength: "2", pattern: "^\w+$"
          }),
          E$("div", { style: "text-align: right;" },
            E$("button", { style: "margin-top: 10px;", onclick: () => this.tryJoinChat(state) }, "Join the chat!")
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
        E$("div", { style: "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -100%);" },
          E$("p",
            E$("b", "Choose which room to join:")
          ),
          E$("select", { style: "display: block;" },
            state.rooms && state.rooms.map(room => E$("option", { value: room }, "Room: " + room))
          ),
          E$("div", { style: "text-align: right;" },
            E$("button", { style: "margin-top: 10px;", onclick: () => this.joinChatRoom(state) }, "Join selected chat room")
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
      this.typing = false
      this.componentIsProper = false
      this.html = E$("div", this.generate(state))
    }

    generate(state) {
      return (
        E$("div", { style: "height: 100%;" },

          // Heading
          E$("div", { style: "margin: 0; height: 10%; box-shadow: 0 0 10px 0 #888888; display: flex;" },
            E$("div", { style: "height: 100%; width: 50%; display: flex; justify-content: center; align-items: center; border-right: 1px solid gainsboro;" },
              E$("h2", { style: "margin: 0;" }, `#${state.room}`)
            ),
            E$("div", { style: "height: 100%; width: 50%; display: flex; justify-content: center; align-items: center;" },
              E$("input", {
                type: "checkbox", id: "auto-scroll", checked: "true", onchange: event => {
                  state.autoscroll = event.target.checked
                }
              }),
              T$("Toggle automatic scrolling")
            )
          ),

          // Chat log
          E$("div", { style: "height: 80%;" },
            E$("div", { id: "messages", style: "height: 100%; overflow: auto; padding: 0 10px 0 10px;" }
            )
          ),

          // Currently typing people
          E$("div", { style: "height: 4%; display: flex; justify-content: center; align-items: center;" },
            E$("p", { style: "color: cornflowerblue;", id: "typers" })
          ),

          // Chat input
          E$("div", { style: "height: 6%; display: flex;" },
            // Nick name thingy
            E$("div", { style: "height: 100%; width: 10%; background-color: cornflowerblue; color: white; display: flex; justify-content: center; align-items: center;" },
              E$("p", state.nickname)
            ),
            // Input text
            E$("div", { style: "height: 100%; width: 90%; display: flex;" },
              E$("input", {
                type: "text", placeholder: "Enter your message here (Press Enter to send)", style: "height: 100%; width: 100%; margin: 0; padding: 20px; outline: none; border: 0; background-color: gainsboro;",
                id: "chat-msg", onkeydown: this.inputKeyDown, onkeyup: event => this.inputKeyUp(event, state)
              }),
              E$("button", { style: "display: none;", onclick: () => this.sendChatMessage(state) }, "Send")
            )
          )
        )
      )
    }

    inputKeyDown(event, state) {
      if (event.key === "Enter") {
        document.querySelector("button").click()
      }
    }

    inputKeyUp(event, state) {
      if (this.typing) {
        if (event.target.value.trim().length === 0) {
          state.ws.send(JSON.stringify({
            Type: "typing",
            Body: "false"
          }))
          this.typing = false
        }
      } else {
        if (event.target.value.trim().length > 0) {
          state.ws.send(JSON.stringify({
            Type: "typing",
            Body: "true"
          }))
          this.typing = true
        }
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
      // Set up the component if needed
      if (!this.componentIsProper && state.nickname !== null && state.room !== null) {
        this.componentIsProper = true
        SETE$(this.html, this.generate(state))
      }
      // Add messages to the screen if there are any
      for (let i = 0; i < state.chatlog.length; i++) {
        let msg = state.chatlog.shift()
        document.getElementById("messages").appendChild(
          E$("p", { style: `${msg.Sender === state.previousSender ? "margin: 5 0 0 0;" : "margin: 30 0 0 0;"} word-break: break-word;` },
            E$("b",
              E$("span", { style: "color: gray;" }, `[${msg.Timestamp}] `),
              E$("span", `${msg.Sender}: `)
            ),
            T$(msg.Data)
          )
        )
      }
      // update typers status
      for (let typers = document.getElementById("typers"); typers !== null; typers = null) {
        if (state.typers.length > 0) {
          SETE$(typers, E$("span", "People are typing: " + state.typers.join(", ")))
        } else {
          SETE$(typers, E$("span"))
        }
      }
    }

  }

  LOAD$(
    () => console.log("Document loaded, setting up ChatApp..."),
    () => INIT_CLASS$("#app-root", ChatApp)
  )

})()
