# Janus Simple Command Library

This library provides both a "Client" and "Server" class for following the Janus Simple Command Protocol.

This protocol prioritizes human readable message passing and JSON formats over compact message structures.
This is meant as a library for plugging into any number of bi-directional connections that you can define,
and provides a means of multi-plexing multiple "senders" on the same connection.

# Usage

Please see (below) for an in depth explanation of the protocol as it stands.

In short, on a bidirectional connection either party can initiate a "sender" or a server.
The server exists to simply respond to the requests of a sender. The sender talks with
the server by commands and then waits for a status message that returns.

From the standpoint of this library, you only need to worry yourself with commands, their send payloads,
and the corresponding status payloads that could come back.

```typescript
import { CommandMap, CommandMessage, StatusMessage } from '@janushealth/janus-simple-command'
// Strongly type your expected commands
type Commands = 'fly' | 'eat'

// Define the command schemas using our built-in CommandMessage type
type CommandMap: CommandMap<Commands> = {
  fly: CommandMessage<'fly', {
    captain: string,
    plane: 'cessna' | '737'
  }>,
  eat: CommandMessage<'eat', {
    eat: boolean
  }>
}
// Define the status schema using our built-in StatusMessage type
type FlySuccess = {
  mph: number
  elevation: number
}
type FlyErrors = 'crashed' | 'failureToLaunch'
type EatSuccess = {
  food: string
}
type StatusMap: StatusMap<Commands> = {
  fly: StatusMessage<FlySuccess, FlyErrors>
  eat: StatusMessage<EatSuccess>
}

// Create your connection
const connection: Connection = someConnectionFunction()

const server = new Server<Commands, CommandMap, StatusMap>({
  maxSenderInactivity: 10000, // the amount of time we allow between commands
  maxAckRetries: 4, // If we drop an ack, the amount of times we retry a status
  ackRetryDelay: 500, // The amount we wait before retrying on a dropped ack
  connection,
  debug: (msg) => console.log(msg),
})

server.addMessageHandler('fly', async (msg: CommandMap['fly']): Promise<HandlerReturn<StatusMap['fly']>> => {
  return {
    isError: false,
    data: {
      mph: msg.data.plane === 'cessna' ? 100 : 200,
      elevation: 30000,
    },
  },
})
// Handler for eat command
server.addMessageHandler('eat', async (msg: CommandMap['eat']): Promise<HandlerReturn<StatusMap['eat']>> => {
  // Return for eat
})

await server.open()

// At the end of the server
await server.close()


// For the client connection
const connectionForClient: Connection = someConnectionFunction()

const client = new Client<Commands, CommandMap, StatusMap>({
    commands: ['fly', 'eat'],
    ackRetryDelay: 1000,
    maxAckRetries: 3,
    connection: clientConnection,
    debug: (...args) => {
      console.log(...args)
    },
  })

await client.open()

// Create a sender
const sender = await client.createSender()
const result = sender.command('fly', () => ({
  captain: 'jack',
  plane: '737',
}))

// { mph: 200, elevation: 30000 }
console.log(result)
```

## Creating a Connection

In order to agnosticize our library's dependence on a transport layer, this library relies on a simplified connection
interface. You can either look for other implementations of the connection or you can instantiate your own interface
and pass it to the connection.

### One-to-One Relationship

The Connection interface that you implement is meant to be 1-to-1 to either a Client or Server instance. When noting
the setter methods, we only allow one set of listeners on the connection. This does not mean that you cannot run
multiple Servers over the same underlying connection (like a websocket), but it does mean that you will provide
a Connection that interacts with the websocket for each Server or Client that you want to declare.
