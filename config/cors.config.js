import cors from "cors";

export const configureCors = () => {
  return cors({
    //origin -> this will tell that which origins you want user can access your api
    origin: (origin, callback) => {
      console.log("[CORS] incoming Origin:", origin);

      const allowedOrigins = [
        //"http://localhost:5173", // React dev server
        "https://email-ummarizer-frontend-zdh1.vercel.app/", // Production
      ];
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by cors"));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept-Version"],
    exposedHeaders: ["X-Total-Count", "Content-Range"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });
};
