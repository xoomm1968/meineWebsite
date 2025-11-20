// worker_argon2.mjs
// Example adapter that exposes a minimal argon2-compatible API for the Worker.
// This file is a template: install and bundle a real argon2 implementation (e.g. argon2-browser)
// and adapt the imports below. Then ensure your bundler includes this module in the Worker build.

// Example using argon2-browser (you must `npm install argon2-browser` and bundle):
// import argon2 from 'argon2-browser';

const adapter = {
  // hash(password) -> returns encoded PHC string (or another serialised hash)
  hash: async (password) => {
    // Placeholder implementation — replace with real call to argon2
    // Example (argon2-browser):
    // const res = await argon2.hash({ pass: password, time: 2, mem: 65536, hashLen: 32 });
    // return res.encoded;
    throw new Error('argon2 adapter not implemented. Install and bundle `argon2-browser` and adapt this file.');
  },
  // verify(storedEncoded, password) -> boolean
  verify: async (storedEncoded, password) => {
    // Placeholder — use library verify method
    // Example (argon2-browser): const r = await argon2.verify({ pass: password, encoded: storedEncoded }); return r && r.verified === true;
    throw new Error('argon2 adapter not implemented. Install and bundle `argon2-browser` and adapt this file.');
  }
};

export default adapter;
