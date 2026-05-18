import https from "node:https";

const username = process.argv[2] || "wiilk";
const u = encodeURIComponent(username);

const url =
  `https://lidraughts.org/api/games/user/${u}` +
  `?max=3&perfType=russian&moves=true&tags=true&clocks=false&evals=false&sort=dateDesc`;

console.log(url);

https.get(url, {
  headers: {
    "User-Agent": "DamaDojo debug",
    "Accept": "application/x-chess-pgn,text/plain,*/*",
  },
}, (res) => {
  console.log("STATUS", res.statusCode);
  console.log("CONTENT-TYPE", res.headers["content-type"]);

  let chunks = [];
  res.on("data", (c) => chunks.push(c));
  res.on("end", () => {
    const text = Buffer.concat(chunks).toString("utf8");
    console.log(text.slice(0, 2000));
  });
}).on("error", (e) => {
  console.error("ERROR", e);
});