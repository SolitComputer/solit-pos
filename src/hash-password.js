const bcrypt =
  require(
    "bcryptjs"
  );

async function run() {

  const password =
    "sales01@solit.com";

  const hash =
    await bcrypt.hash(
      password,
      10
    );

  console.log(
    hash
  );
}

run();