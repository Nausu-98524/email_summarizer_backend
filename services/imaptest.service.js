import imaps from "imap-simple";

export const getImapConfig = (email, appPassword) => ({
  imap: {
    user: email,
    password: appPassword, // Gmail App Password Not Gamil Password
    host: "imap.gmail.com",
    port: 993,
    tls: true,
    authTimeout: 10000,
    // Dev-only workaround for SSL interception
    tlsOptions: { rejectUnauthorized: process.env.NODE_ENV === "production" },
  },
});

export async function imapTest(user, password) {
  const config = getImapConfig(user, password);

  let connection;

  try {
    connection = await imaps.connect(config);

    connection.imap.on("error", (err) => {
      console.error("IMAP error:", err.message);
    });

    await connection.openBox("[Gmail]/All Mail");

    const messages = await connection.search(["ALL"], {
      bodies: ["HEADER.FIELDS (FROM TO SUBJECT DATE)"],
      struct: true,
      markSeen: false,
    });

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    try {
      if (connection && connection.imap.state !== "disconnected") {
        connection.end();
      }
    } catch (err) {
      console.error("Error closing connection:", err.message);
    }
  }
}



export async function ImapCheck(user, password) {
  const config = getImapConfig(user, password);
  let connection;

  try {
    connection = await imaps.connect(config);

    // prevent unhandled IMAP errors
    connection.imap.on("error", (err) => {
      console.error("IMAP error:", err.message);
    });

    // try opening mailbox to confirm full access
    await connection.openBox("[Gmail]/All Mail");

    return true; 
  } catch (err) {
    console.error("❌ IMAP connection failed:", err.message);
    return false; 
  } finally {
    try {
      if (connection && connection.imap.state !== "disconnected") {
        connection.end();
      }
    } catch {}
  }
}
