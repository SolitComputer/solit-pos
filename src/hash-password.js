const bcrypt =
  require(
    "bcryptjs"
  );

async function run() {

  const password =
    "#Fadrian5779";

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