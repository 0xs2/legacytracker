module.exports = function (app,knex,sortArray,m) {

    app.get("/", async (req,res) => {
        res.render("index", {data: await m.getServerInformation(knex,sortArray)});
    });

    app.get("/server/:id", async (req,res) => {
        let data = await m.getServerInformationByID(req.params.id, knex);
        if(!data) {
            res.status(404).send("not found");
        }
        else {
            res.render("server", {data: data});
        }
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

    app.all('*', (req, res) => {
        res.status(404).send("not found");
      });
}


