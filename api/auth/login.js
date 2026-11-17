import { getSession, originAllowed, passwordMatches, sendError, setSession } from "../../lib/auth.js";
const attempts = new Map();
export default function handler(req,res) {
  if (req.method !== "POST") return sendError(res,405,"Method not allowed");
  if (!originAllowed(req)) return sendError(res,403,"Invalid request origin");
  const now = Date.now(), ip = req.headers["x-forwarded-for"]?.split(",")[0] || "unknown";
  const prior = attempts.get(ip);
  if (prior && prior.until > now && prior.count >= 8) return sendError(res,429,"Too many sign-in attempts. Try again later.");
  const body = typeof req.body === "object" && req.body ? req.body : {};
  const username = process.env.ENDROOM_USERNAME;
  const hash = process.env.ENDROOM_PASSWORD_HASH;
  if (!username || !hash || !process.env.SESSION_SECRET) return sendError(res,503,"Authentication is not configured on the server.");
  const validUser = typeof body.username === "string" && body.username === username;
  const validPassword = typeof body.password === "string" && body.password.length <= 256 && passwordMatches(body.password,hash);
  if (!validUser || !validPassword) {
    const count = prior && prior.until > now ? prior.count + 1 : 1;
    attempts.set(ip,{count,until:now+15*60*1000});
    return sendError(res,401,"Incorrect username or password.");
  }
  attempts.delete(ip);
  setSession(res,{user:username,cwd:null,sandboxId:null});
  return res.status(200).json({authenticated:true,username,cwd:"~"});
}
