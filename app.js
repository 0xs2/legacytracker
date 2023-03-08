const express = require("express");
const compression = require("compression");
const helmet = require("helmet");
const app = express({ strict: true });
const knex = require('./functions/knex');
const sortArray = require('sort-array');

require('dotenv').config({path: './.env'});

app.set("view engine", "ejs")

app.use(compression());
app.use(express.static('public'));
app.use(helmet.dnsPrefetchControl());
app.use(helmet.expectCt());
app.use(helmet.frameguard());
app.use(helmet.hidePoweredBy());
app.use(helmet.hsts());
app.use(helmet.ieNoOpen());
app.use(helmet.noSniff());
app.use(helmet.originAgentCluster());
app.use(helmet.referrerPolicy());
app.use(helmet.xssFilter());

require('./functions/web')(app,knex,sortArray);

app.listen(process.env.PORT);