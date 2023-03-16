# `jsp-ws-connection`

This library is for specfic implementaions of the janus-simple-command package.

Currently supported

- Node

---

Node usage example

```bash
yarn add @hanseltime/janus-simple-command @hanseltime/jsp-ws-connection
```

```typescript
import { NodeWebSocketConnection } from '@hanseltime/jsp-ws-connection'
import { HandlerReturn, Server } from '@hanseltime/janus-simple-command'

const app = express()

const server = app.listen(PORT)
const wss = new WebSocketServer({
  server: server,
  path: process.env.ROOT_PATH ?? '/',
})

let serv: Server<Commands, CommandMap, StatusMap> | undefined = undefined
wss.on('connection', async (ws) => {
  debug('INFO', 'ws connected')
  const connection = new NodeWebSocketConnection(ws, 'server', console.log)

  serv = new Server<Commands, CommandMap, StatusMap>({
    maxSenderInactivity: 10000,
    maxAckRetries: 3,
    ackRetryDelay: 10000,
    connection,
    debug: (msg: string) => console.log(msg),
  })

  serv.setMessageHandlerWithIntermediate('cmd', {
    handler: async (msg, inter): Promise<HandlerReturn<StatusMap['cmd']>> => {
      runbot(msg)
    },
  })

  await serv.open()
})
```

See JSP Readme for more

https://github.com/hanseltime/hanseltime-janus-simple-command/tree/master/packages/janus-simple-command#usage
