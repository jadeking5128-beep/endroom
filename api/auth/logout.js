import { clearSession, originAllowed, sendError } from "../../lib/auth.js";
export default function handler(req,res) {
  if (req.method !== "POST") return sendError(res,405,"Method not allowed");
  if (!originAllowed(req)) return sendError(res,403,"Invalid request origin");
  clearSession(res);
  return res.status(200).json({ok:true});
}
