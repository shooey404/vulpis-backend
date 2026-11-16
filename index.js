const { Server, Room } = require("colyseus");
const { Schema, MapSchema, type } = require("@colyseus/schema");
const { WebSocketTransport } = require("@colyseus/ws-transport");
const express = require("express");
const cors = require("cors");
const http = require("http");
const { createClient } = require("@supabase/supabase-js");

// 1. Connect to your database using environment variables
const supabase = createClient(
    process.env.SUPABASE_URL || "https://dummy.supabase.co", 
    process.env.SUPABASE_ANON_KEY || "dummy"
);

// 2. Define what a Player looks like to the server
class Player extends Schema {
    constructor() {
        super();
        this.x = 0;
        this.y = 1;
        this.z = 0;
        this.skinColor = "#ffcc99";
        this.hatId = "none";
    }
}
type("number")(Player.prototype, "x");
type("number")(Player.prototype, "y");
type("number")(Player.prototype, "z");
type("string")(Player.prototype, "skinColor");
type("string")(Player.prototype, "hatId");

// 3. Define the overall Room State
class GameState extends Schema {
    constructor() {
        super();
        this.players = new MapSchema();
    }
}
type({ map: Player })(GameState.prototype, "players");

// 4. Create the Multiplayer Room
class GameRoom extends Room {
    onCreate(options) {
        this.setState(new GameState());

        // When a player sends a "move" command, update their X/Y/Z on the server
        this.onMessage("move", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.x = data.x;
                player.y = data.y;
                player.z = data.z;
            }
        });
    }

    // Before they fully join, check their Supabase login token
    async onAuth(client, options, request) {
        if (options.token) {
            const { data, error } = await supabase.auth.getUser(options.token);
            if (!error && data.user) {
                // Fetch their avatar from the database
                const { data: avatar } = await supabase
                    .from('avatars')
                    .select('cosmetics')
                    .eq('user_id', data.user.id)
                    .single();
                return { cosmetics: avatar?.cosmetics };
            }
        }
        return { cosmetics: null };
    }

    // Add the player to the game world
    onJoin(client, options, auth) {
        const player = new Player();
        
        // Apply their saved avatar choices (or defaults if they didn't log in)
        if (auth && auth.cosmetics) {
            player.skinColor = auth.cosmetics.skinColor || "#ffcc99";
            player.hatId = auth.cosmetics.hatId || "none";
        }
        
        this.state.players.set(client.sessionId, player);
        console.log(client.sessionId, "joined the game!");
    }

    // Remove them when they disconnect
    onLeave(client, consented) {
        this.state.players.delete(client.sessionId);
        console.log(client.sessionId, "left the game!");
    }
}

// 5. Start the Server
const app = express();
app.use(cors());

const server = http.createServer(app);
const gameServer = new Server({
    transport: new WebSocketTransport({ server })
});

gameServer.define("game_room", GameRoom);

const PORT = process.env.PORT || 2567;
server.listen(PORT, () => console.log(`Vulpis Server active on port ${PORT}`));