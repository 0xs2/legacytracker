module.exports = function (app,knex,sortArray,m) {

    app.get("/", async (req,res) => {
        res.render("index", {data: await m.getServerInformation(knex,sortArray)});
    });

    app.get("/server/:id", async (req,res) => {
        let data = await m.getServerInformationByID(req.params.id, knex);
        !data ? res.status(404).send("not found") : res.render("server", {data: data});
    });

    app.get("/api/getServerHistory", async (req,res) => {
        res.json(await m.getServerHistory(req.query['id'], knex));
    });

    app.get("/api/getGlobalHistory", async (req,res) => {
        res.json(await m.getGlobalHistory(knex));
    });

    app.get("/api/getStats", async (req,res) => {
        res.json(await m.getStats(knex));
    });

    app.get("/api/getPlayer", async (req,res) => {
        res.json(await m.getPlayer(req.query['player'],knex));
    });

    app.get("/api/getServerPlayers", async (req,res) => {
        !req.query['key'] || req.query['key'] != process.env.API_KEY ? res.json({success: false, message: "invalid/no api key"}) : res.json(await m.getServerPlayers(knex,req.query['id']));
    });

    app.get("/api/getPlayersOnline", async (req,res) => { 
        res.json(await m.getPlayersOnline(knex, req.query['id']));

    });

    app.get("/api/getServer", async (req,res) => {
        !req.query['key'] || req.query['key'] != process.env.API_KEY ? res.json({success: false, message: "invalid/no api key"}) : res.json(await m.getServerInformationByID(req.query['id'], knex));
    });

    app.get("/api/getServers", async (req,res) => {
        !req.query['key'] || req.query['key'] != process.env.API_KEY ? res.json({success: false, message: "invalid/no api key"}) : res.json({servers: await m.getServers(knex), success: true});
    });

    app.all('*', (req, res) => {
        res.status(404).send("not found");
      });
}


