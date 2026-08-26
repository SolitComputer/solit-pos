module.exports = {
  apps: [{
    name: 'solit-pos',
    script: 'npm',
    args: 'start',
    cwd: '/var/www/solit-pos',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
}

