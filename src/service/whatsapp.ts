export async function sendWhatsapp(
  target: string,
  message: string
) {

  try {

    await fetch(
      "https://api.fonnte.com/send",
      {
        method:
          "POST",

        headers: {
          Authorization:
            process.env
              .WHATSAPP_API_KEY || "",

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            target,
            message,
          }),
      }
    );

  } catch (
    error
  ) {
    console.log(
      error
    );
  }
}