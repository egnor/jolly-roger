// Server-side code in Meteor
import { WebApp } from "meteor/webapp";
import type { GdriveMimeTypesType } from "../imports/lib/GdriveMimeTypes";
import { URL } from "url";
import { Meteor } from "meteor/meteor";
import Puzzles from "../imports/lib/models/Puzzles";

// Hack to break into internal Meteor stuff
declare module "meteor/ddp" {
  export namespace DDP {
    var _CurrentMethodInvocation: any; // Assuming no specific type info available
  }
}

// Endpoint.
WebApp.connectHandlers.use("/apiCreatePuzzle94549", async (req, res, next) => {
  if (req.method === "GET") {
    const urlObject = new URL(req.url || "", `http://${req.headers.host}`);
    const queryParams = urlObject.searchParams;

    // To get a specific query parameter
    const huntId = queryParams.get("huntId") || "";
    const title = queryParams.get("title") || "";
    const url = queryParams.get("url") || "";
    const tags = (queryParams.get("tags") || "").split(",");
    const expectedAnswerCount = 1;
    const docType = <GdriveMimeTypesType>"spreadsheet";
    const userId = queryParams.get("userId") || "";

    const puzzle = await Puzzles.findOneAsync({ title: title });
    if (puzzle) {
      console.log(
        "tried to access puzzle '" + title + "' but it already exists",
      );

      res.writeHead(500);
      res.end("Puzzle already exists with that title");

      return;
    }

    //const customContext = { userId: "Foobar" };
    const payload = { huntId, title, url, tags, expectedAnswerCount, docType };

    const methodInvocation: DDPCommon.MethodInvocation = {
      userId: userId,
      // Set other necessary properties if needed
    };

    // Call 'mymethod' within this context
    await DDP._CurrentMethodInvocation.withValue(methodInvocation, async () => {
      const result = await Meteor.callAsync("Puzzles.methods.create", payload);

      res.writeHead(200);
      res.write("Puzzle id created: " + result);
      res.end("\nHappy Puzzling!");
    });
    console.log("Created puzzle via API");
  } else {
    // If not a GET request, go to the next handler
    next();
  }
});

WebApp.connectHandlers.use("/getAllPuzzleURLs", async (req, res, next) => {
  const urlObject = new URL(req.url || "", `http://${req.headers.host}`);
  const queryParams = urlObject.searchParams;
  const huntId = queryParams.get("huntId") || "";

  res.writeHead(200);
  const puzzles = await Puzzles.find({ hunt: huntId }).fetchAsync();
  for (const puzzle of puzzles) {
    if (puzzle.url) {
      res.write(puzzle.url + "\n");
    }
  }
  res.end();
});
