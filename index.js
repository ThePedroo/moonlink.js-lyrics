const {
  Plugin,
  Structure
} = require("moonlink.js");

class Lyrics extends Plugin {
  constructor() {
    super();
    this.name = "Lyrics";
    this._manager;
    this.initialized = false;
  }

  load(manager) {
    /* Avoid double initialization */
    if (this.initialized) return;

    this._manager = manager;
    this._manager.emit("debug", `@Moonlink(Lyrics) - Plugin "Lyrics" has been loaded successfully`);
    this.initialized = true;

    this.injectCodes();
  }

  async _emulateLyricsResponse(identifier) {
    const searchEndpoint = "loadtracks?identifier=" + identifier
    const tracks = await this.get(searchEndpoint);

    /* Emulation of Lyrics.kt empty response */
    if (tracks.length > 0) {
      return {
        timestamp: Date.now(),
        status: 404,
        error: "Not Found",
        message: "Not Found",
        path: searchEndpoint
      };
    }

    const lyrics = await this.get("loadlyrics?encodedTrack=" + encodeURIComponent(tracks[0].info.identifier));

    /* Filter for the first track, if returns a list */
    let track = lyrics.data
    if (lyrics.loadType == 'lyricsMultiple') track = track[0]

    /* Emulation of Lyrics.kt response */
    const response = {
      type: track.synced ? "timed" : "text",
      track: {
        title: tracks.data[0].info.title,
        author: tracks.data[0].info.author,
        album: "Unknown",
        albumArt: [{
          url: tracks.data[0].info.thumbnail,
          height: 0,
          width: 0
        }],
      },
      source: source || "ytsearch"
    }

    /* If track is synced, return the lines */
    if (track.synced) {
      response.lines = track.lyrics.map((phrase) => {
        return {
          line: phrase.text,
          range: {
            start: phrase.startTime,
            end: phrase.endTime
          }
        }
      })

    /* If track is not synced, return the text */
    } else {
      response.text = lyrics.data.map((line) => line.text).join("\n")
    }
  }

  injectCodes() {
    /* Extends MoonlinkRestFul, adding searchLyrics, getLyrics and getPlayerLyrics */
    Structure.extend("MoonlinkRestFul", MoonlinkRest => class extends MoonlinkRest {
      async searchLyrics(name, source) {
        if (this.info.isNodeLink)
          return this._emulateLyricsResponse((source || "yt") + "search:" + name)

        return (await this.get("lyrics/search/" + name));
      }

      async getLyrics(id, source) {
        if (this.info.isNodeLink)
          return this._emulateLyricsResponse(source !== undefined && source !== "yt" ? (source + ":" + id) : "https://www.youtube.com/watch?v=" + id)

        return (await this.get("lyrics/" + id));
      }

      async getPlayerLyrics(guildId, source) {
        if (this.info.isNodeLink) {
          const currentPlayer = await this.get(`sessions/${this.sessionId}/players/${guildId}`);

          if (!currentPlayer.track) return null;

          return this._emulateLyricsResponse(currentPlayer.track.sourceName === "yt" ? "https://www.youtube.com/watch?v=" + currentPlayer.track.identifier : ((source || "ytsearch") + ":" + currentPlayer.track.identifier));
        }
        
        return (await this.get(`sessions/${this.sessionId}/players/${guildId}/lyrics`));
      }
    });

    /* Extends MoonlinkPlayer, adding lyrics method */
    Structure.extend("MoonlinkPlayer", MoonlinkPlayer => class extends MoonlinkPlayer {
      async lyrics() {
        if (!this.current) return null;

        if (this.get("lyrics") && this.get("lyrics").identifier !== this.current.identifier) {
          const lyricIds = await this.node.rest.searchLyrics(`${this.current.title} - ${this.current.author}`) || {};

          for (const lyricObj of lyricIds) {
            if (this.get("lyrics") && this.get("lyrics").identifier == this.current.identifier && this.get("lyrics").lyricObj !== null) return this.get("lyrics").lyricObj;

            let {
              videoId
            } = lyricObj;

            const lyric = await this.node.rest.getLyrics(videoId);

            if (lyric.status !== 404) {
              this.set("lyrics", {
                identifier: this.current.identifier,
                lyricObj: lyric
              });
            }
          }

          if (!this.get("lyrics") || this.get("lyrics").identifier !== this.current.identifier) {
            this.set("lyrics", {
              identifier: this.current.identifier,
              lyricObj: null
            });
          }

          return this.get("lyrics").lyricObj;
        } else if (this.get("lyrics") && this.get("lyrics").identifier == this.current.identifier) {
          return this.get("lyrics").lyricObj;
        } else if (!this.get("lyrics")) {
          this.set("lyrics", {});

          return this.lyrics();
        }

        return this.get("lyrics").lyricObj;
      }
    });
  }
}

module.exports = {
  Lyrics
};