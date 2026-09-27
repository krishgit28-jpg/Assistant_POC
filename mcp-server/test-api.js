import { Client } from '@modelcontextprotocol/sdk/client/index.js'
const client = new Client({name: "test", version: "1"}, {});
console.log(Object.keys(client.__proto__));
