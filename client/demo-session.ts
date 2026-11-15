/** Select an identity in the local demonstration. The server keeps the credential. */
export async function selectDemoProfile(profile: string): Promise<void> {
  const response = await fetch("/api/demo-session", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }), cache: "no-store",
  });
  if (!response.ok) throw new Error("Local demo profile unavailable. Check the server configuration.");
}
