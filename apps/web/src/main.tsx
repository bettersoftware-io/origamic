import { readBuildEnv } from "./app/env.ts";
import { startApp } from "./app/startApp.tsx";

import "./index.css";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("index.html has no #root element");
}

startApp(readBuildEnv(), root);
