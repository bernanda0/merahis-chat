const express = require("express");
const bodyParser = require("body-parser");
const pug = require("pug");
const { v4 } = require("uuid");
const dayjs = require("dayjs");
const relativeTime = require("dayjs/plugin/relativeTime");
const Chance = require("chance");
const compression = require("compression");
const Redis = require("ioredis");
const WebSocket = require("ws");
require("dotenv").config();

const socket = new WebSocket(
  "wss://ctf-netlab-ws-services.dgrttk.easypanel.host/chats"
);

const app = express();
const PORT = process.env.PORT || 3000;

const chance = new Chance();
let username = "";

dayjs.extend(relativeTime);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "pug");

app.use(express.static(__dirname + "/assets"));
app.use(compression());

// Connect to Redis
const redis = new Redis(process.env.REDIS_URL);

app.get("/", async (req, res) => {
  username = chance.name();

  // Fetch all tweets from Redis
  const tweetIds = await redis.zrevrange("tweets", 0, -1);
  const tweets = [];

  // Fetch each tweet using its ID
  for (const tweetId of tweetIds) {
    const tweet = await redis.hgetall(`tweet:${tweetId}`);
    tweets.push(tweet);
  }

  const posts = pug.compileFile("views/components/post.pug", {
    globals: ["global"],
  });

  let markup = "";
  tweets.forEach((tweet) => {
    tweet.time = dayjs().to(dayjs(tweet.time));
    markup += posts({ t: tweet });
  });

  // Render the index page with all tweets
  res.render("index", { name: username, tweetsMarkup: markup });
});

app.post("/send", async (req, res) => {
  console.log("Sending tweet");
  const { message, username } = req.body;
  const _tweet = {
    id: v4(),
    message,
    username,
    retweets: 0,
    likes: 0,
    time: new Date().toString(),
    avatar:
      "https://ui-avatars.com/api/?background=random&rounded=true&name=" +
      username,
  };

  // Store tweet in Redis
  await redis.zadd("tweets", Date.now(), _tweet.id);
  await redis.hmset(`tweet:${_tweet.id}`, _tweet);
  // Format time
  _tweet.time = dayjs().to(dayjs(_tweet.time));

  // send the _tweet via websocket
  console.log("Sent tweet");
  socket.send(JSON.stringify(_tweet));
  res.status(200);
});

app.post("/like/:id", async (req, res) => {
  const { id } = req.params;
  const tweet = await redis.hgetall(`tweet:${id}`);
  tweet.likes = parseInt(tweet.likes) + 1;

  // Update like count in Redis
  await redis.hmset(`tweet:${id}`, tweet);

  socket.send(JSON.stringify(tweet));
  res.status(200);
});

app.post("/retweet/:id", async (req, res) => {
  const { id } = req.params;
  const tweet = await redis.hgetall(`tweet:${id}`);
  tweet.retweets = parseInt(tweet.retweets) + 1;

  // Update retweet count in Redis
  await redis.hmset(`tweet:${id}`, tweet);

  socket.send(JSON.stringify(tweet));
  res.status(200);
});

app.listen(PORT);
console.log("root app listening on port: 3000");
