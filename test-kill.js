const { spawn } = require('child_process');
const child = spawn('ls');
setTimeout(() => {
  try {
    console.log("Killing...");
    child.kill('SIGKILL');
    console.log("Killed successfully");
  } catch(e) {
    console.log("Error:", e);
  }
}, 1000);
