import "./style.css";
import { start } from "./app/start.ts";
import { renderFatal } from "./ui/shell.ts";
import { messageOf } from "./util.ts";

void start().catch((error: unknown) => {
  console.error(error);
  renderFatal(messageOf(error), []);
});
