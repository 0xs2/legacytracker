const express = require("express");
const compression = require("compression");
const helmet = require("helmet");
const app = express({ strict: true });
const knex = require('./functions/knex');
const sortArray = require('sort-array');
const m = require('./functions/main');
require('dotenv').config({path: './.env'});

app.set("view engine", "ejs")

app.use(compression());
app.use(express.static('public'));
app.use(helmet.dnsPrefetchControl());
app.use(helmet.frameguard());
app.use(helmet.hidePoweredBy());
app.use(helmet.hsts());
app.use(helmet.ieNoOpen());
app.use(helmet.noSniff());
app.use(helmet.originAgentCluster());
app.use(helmet.referrerPolicy());
app.use(helmet.xssFilter());

app.get("/", async (req,res) => {
    res.render("index", {data: await m.getServerInformation(knex,sortArray)});
});

app.get("/server/:id", async (req,res) => {
    let data = await m.getServerInformationByID(req.params.id, knex);
    !data ? res.status(404).send("not found") : res.render("server", {data: data});
});

app.get("/user/:user", async (req,res) => {
    let data = await m.getPlayer(req.params.user, knex);
    !data ? res.status(404).send("not found") : res.render("user", {data: data});
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
    let data = await m.getPlayer(req.query['player'],knex);
    res.json(data ? data : {success: false, message: "player does not exist."});
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

app.listen(process.env.PORT);