import { getSession, sendError } from "../../lib/auth.js";
export default function handler(req,res) {
  if (req.method !== "GET") return sendError(res,405,"Method not allowed");
  const session = getSession(req);
  if (!session) return res.status(200).json({authenticated:false});
  return res.status(200).json({authenticated:true,username:session.user,cwd:session.cwd || "~"});
}
