import { Sandbox } from "e2b";
import { getSession, originAllowed, sendError, setSession } from "../lib/auth.js";

const MAX_COMMAND = 240;
const PATH_RE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_./-]+$/;
function quote(value) { return "'" + value.replace(/'/g, "'\\''") + "'"; }
function parse(raw) {
  if (typeof raw !== "string" || raw.length > MAX_COMMAND || /[\n\r;&|<>$\x60\\]/.test(raw)) throw new Error("Invalid command format.");
  const tokens = raw.match(/"[^"]*"|'[^']*'|[^\s]+/g) || [];
  return tokens.map(t => {
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1,-1);
    return t;
  });
}
function safePath(value) {
  if (!PATH_RE.test(value) || value.split("/").some(part=>part==="..") || value.startsWith("~")) throw new Error("Only relative workspace paths are allowed.");
  return value;
}
function build(tokens) {
  const [cmd,...args]=tokens;
  const flags = (allowed) => args.filter(x=>x.startsWith("-")).every(x=>allowed.includes(x));
  const paths = args.filter(x=>!x.startsWith("-"));
  if (["pwd","date","whoami","uname"].includes(cmd) && args.length===0) return cmd;
  if (cmd==="ls" && flags(["-a","-l","-la","-al"]) && paths.length<=1) return ["ls",...args.map(x=>x.startsWith("-")?x:safePath(x))].map(quote).join(" ");
  if (cmd==="cd" && args.length<=1) return "cd " + (args.length ? quote(safePath(args[0])) : "") + " && pwd";
  if (["mkdir","touch","cat"].includes(cmd) && paths.length>=1 && paths.length<=4 && args.every(x=>!x.startsWith("-"))) return [cmd,...paths.map(safePath)].map(quote).join(" ");
  if (cmd==="rm" && args.length===1 && !args[0].startsWith("-")) return "rm -- " + quote(safePath(args[0]));
  if (cmd==="echo" && args.length<=40) return "echo " + args.map(quote).join(" ");
  if (cmd==="python3" && args.length===1 && args[0]==="--version") return "python3 --version";
  if (cmd==="node" && args.length===1 && args[0]==="--version") return "node --version";
  if (cmd==="git" && args.length===1 && args[0]==="--version") return "git --version";
  throw new Error("Command not allowed. Type help for the supported workspace commands.");
}
export default async function handler(req,res) {
  if (req.method!=="POST") return sendError(res,405,"Method not allowed");
  if (!originAllowed(req)) return sendError(res,403,"Invalid request origin");
  const session=getSession(req);
  if (!session) return sendError(res,401,"Sign in required.");
  if (!process.env.E2B_API_KEY) return sendError(res,503,"Linux runtime is not configured. Add E2B_API_KEY to server-only environment variables.");
  let command;
  try { command=parse(req.body?.command); if(!command.length) return sendError(res,400,"Enter a command."); }
  catch(e) { return sendError(res,400,e.message); }
  try {
    let sandbox;
    if (session.sandboxId) sandbox=await Sandbox.connect(session.sandboxId);
    else sandbox=await Sandbox.create("base",{timeoutMs:15*60*1000,metadata:{app:"endroom",workspace:session.user}});
    await sandbox.setTimeout(15*60*1000);
    const cwd=session.cwd || (await sandbox.commands.run("pwd",{timeoutMs:10000})).stdout.trim();
    const shellCommand=build(command);
    const result=await sandbox.commands.run(shellCommand,{cwd,timeoutMs:12000});
    let nextCwd=cwd;
    if(command[0]==="cd") nextCwd=result.stdout.trim() || cwd;
    setSession(res,{user:session.user,sandboxId:sandbox.sandboxId,cwd:nextCwd});
    return res.status(200).json({stdout:result.stdout||"",stderr:result.stderr||"",exitCode:result.exitCode,cwd:nextCwd});
  } catch(error) {
    return sendError(res,502,"Linux workspace unavailable. Your session may have expired; sign in again to start a fresh workspace.");
  }
}
