const fetch = require("node-fetch/lib/index");
const fs = require("fs");
const path = require("path");
const { config } = require("../config");
const { inspect } = require("util");

var data;
// first we need to make our "database" where we store the status of each movies check
if (!fs.existsSync("data.json")) {
  // create the data folder
  fs.writeFileSync("data.json", "{}");
  data = {};
  console.debug("Data file created");
} else {
  try {
    data = JSON.parse(fs.readFileSync("data.json"));
  } catch (err) {
    console.error(`Error reading/parsing data file! ${err}`);
    process.exit(1);
  }
}

class HTTPResponseError extends Error {
  constructor(response) {
    super(`HTTP Error Response: ${response.status} ${response.statusText}`);
  }
}

function getMovie(id) {
  return new Promise((resolve, reject) => {
    fetch(config.TMDB.API_URL + config.TMDB.API_ENDPOINTS.MOVIE + id, {
      headers: {
        Authorization: `Bearer ${config.TMDB.API_KEY}`,
      },
    })
      .then((res) => {
        if (!res.ok) reject(new HTTPResponseError(res));
        return res.json();
      })
      .then((data) => resolve(data))
      .catch((err) => reject(err));
  });
}

function notify(movieData) {
  return new Promise((resolve, reject) => {
    const body = {
      username: "MovieRSS",
      embeds: [
        {
          title: `🎥 | ${movieData.title} has released!`,
          description: movieData.overview.substr(0, 2045) + "...",
          url: `https://imdb.com/title/${movieData.imdb_id}`,
          timestamp: new Date().toISOString(),
          footer: {
            text: `Data provided by The Movie DB`,
            icon_url: "https://i.imgur.com/Jh68ukS.png",
          },
          thumbnail: {
            url: `https://image.tmdb.org/t/p/original${movieData.poster_path}`,
          },
          fields: [
            {
              name: "Release Date",
              value: movieData.release_date,
              inline: true,
            },
            { name: "Status", value: movieData.status, inline: true },
            {
              name: "Popularity",
              value: movieData.popularity.toString(),
              inline: true,
            },
          ],
        },
      ],
    };

    console.debug(inspect(body, false, 20, true));
    fetch(config.DISCORD.WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (res.ok) resolve();
        else reject(await res.text());
      })
      .catch((err) => reject(err));
  });
}

function processMovie(movieId) {
  return new Promise((resolve, reject) => {
    // dont notify again for movies already released
    if (data[movieId] && data[movieId]["released"] && data[movieId]["notified"])
      resolve();

    getMovie(movieId)
      .then(async (movieData) => {
        const parts = movieData.release_date.split("-");
        const releaseDate = new Date(parts[0], parts[1] - 1, parts[2]);
        releaseDate.setHours(0, 0, 0, 0);

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        if (releaseDate <= now) {
          // movie has been released!
          console.debug(`${movieData.title} has been released!`);
          data[movieId]["released"] = true;
          notify(movieData)
            .then(() => {
              data[movieId]["notified"] = true;
              fs.writeFileSync("data.json", JSON.stringify(data, null, 3));
              resolve();
            })
            .catch((err) => {
              data[movieId]["notified"] = false;
              fs.writeFileSync("data.json", JSON.stringify(data, null, 3));
              reject(err);
            });
        } else {
          // not released yet
          data[movieId]["released"] = false;
          console.debug(`${movieData.title} has not been released yet.`);
          fs.writeFileSync("data.json", JSON.stringify(data, null, 3));
          resolve();
        }
      })
      .catch((err) => {
        console.error(`Error fetching data for movie ${movieId}! ${err}`);
        return;
      });
  });
}

// checks every hour
setInterval(() => {
  for (const movieId of config.WATCHLIST) {
    processMovie(movieId)
      .then(() => {
        console.debug(`Finished processing movieid ${movieId}`);
      })
      .catch((err) => console.error(err));
  }
}, 3.6e6);

// testing

// var movieId = "436969";
// getMovie(movieId)
//   .then(async (movieData) => {
//     notify(movieData)
//       .then(() => {
//         console.log("Done");
//       })
//       .catch((err) => {
//         console.error(err);
//       });
//   })
//   .catch((err) => {
//     console.error(`Error fetching data for movie ${movieId}! ${err}`);
//     return;
//   });
