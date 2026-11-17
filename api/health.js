export default function handler(_request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({
    service: "endroom",
    status: "ok",
    phase: 1,
    execution: "disabled",
    timestamp: new Date().toISOString()
  });
}
