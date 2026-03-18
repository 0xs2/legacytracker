# legacy tracker

Legacy Minecraft Server Tracker in NodeJS, nice web UI with Graphs and hisoric data

### Update 01/*/2024

This project is now part of the Legacy Minecraft community! Will be maintaining again.

Links: 
- https://tracker.johnymuffin.com
- https://servers.legacyminecraft.com

### Update 08/*/2023
- Proper player page has been added. :)

### Update 07/19/2023
- Servers are now hidden if they are not in the source anymore
- Pings are deleted after 24 hours

## Setup

Starting the tracker will now automatically create the necessary SQLite tables before opening the HTTP port, so you can simply run `node index.js` (with the required `.env` available). If you need to populate initial server data you can still run `node create.js` which hits the upstream API and inserts records.

### Credit
- https://servers.api.legacyminecraft.com
