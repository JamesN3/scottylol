import express from 'express';
import fs from 'fs';
import yaml from 'yaml';
import { closestMatch } from 'closest-match';
import 'dotenv/config';

const COMMAND_DIR = process.env.COMMAND_DIR ??'./commands';
const PORT = process.env.PORT ?? 3000;

type CommandConfig = {
  name: string;
  description: string;
  author: string;
  matches: string[];
  searchUrl?: string;
  home: string;
}

type Redirect = {
  searchUrl?: string;
  home: string
}

type CommandMapping = {[key: string]: Redirect};

const readCommands = (): CommandMapping => {
  const commandDir = fs.readdirSync(COMMAND_DIR);
  const result: CommandMapping = {};
  for (const filename of commandDir) {
    const file = fs.readFileSync(COMMAND_DIR + '/' + filename).toString();
    const fileYaml: CommandConfig = yaml.parse(file);
    const searchUrl = fileYaml.searchUrl;
    const home = fileYaml.home;

    try {
      if (searchUrl) {
        new URL(searchUrl + 'test');
      }
      new URL(home);
    } catch (e) {
      console.error(e);
      console.log(`${fileYaml.name} in ${filename} has an invalid URL`);
      continue;
    }

    for (const command of fileYaml['matches']) {
      if (command in result) {
        console.log("${command} already declared!");
        continue;
      }
      const redirect: Redirect = {searchUrl, home};
      result[command] = redirect;
    }
  }
  return result;
}

(async () => {
  const mappings = readCommands();
  const app = express();
  
  app.get('/search', (req, res, next) => {
    const { q } = req.query;
    if (typeof q !== "string") {
      return res.status(400).send("Bad request");
    }
    const match = q.match(/^(\S*)(?:\s(.*))?$/);
    if (match === null) {
      return res.status(400).send("Bad request");
    }

    const token = match[1].toLowerCase();
    // If no matching token is found go to fallback
    if (!(token in mappings)) {
      const closest = closestMatch(token, Object.keys(mappings));
      return next({token, closest});
    }

    const query = match[2];
    const config = mappings[token];
    const home = config.home;
    const searchUrl = config.searchUrl;


    const target = (searchUrl === undefined || query === undefined) ? home : searchUrl + query;

    const url = new URL(target);
    res.redirect(url.toString());
  });

  const errorHandler: express.ErrorRequestHandler = (value: {token: string, closest: string}, req, res, next) => {
    res.status(404).send(`Command not found: ${value.token}. Did you mean: ${value.closest}?`);
  }
  app.use(errorHandler);

  app.listen(PORT, () => console.log(`Server is listening at port ${PORT}.`));
})();
