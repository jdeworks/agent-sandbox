services:
  agent:
    build: .
    container_name: sandbox-{{PROJECT_NAME}}
    working_dir: /workspace/src
    environment:
      - HOME=/workspace
      - PATH=/workspace/.venv/bin:/opt/opencode/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
    volumes:
      - {{WORKSPACE_PATH}}:/workspace/src
      - npm_cache_{{PROJECT_NAME}}:/workspace/.npm
      - pip_cache_{{PROJECT_NAME}}:/workspace/.cache/pip
      - venv_{{PROJECT_NAME}}:/workspace/.venv
      - ./opencode_data:/workspace/.config/opencode
      - ./opencode_sessions:/workspace/.local/share/opencode
      - ./logs:/workspace/.local/share/opencode/log
      - opencode_cache_{{PROJECT_NAME}}:/workspace/.cache/opencode
      - ./changes.txt:/workspace/.sandbox/changes.txt
    ports:
      - "3000:3000"
      - "5000:5000"
      - "5173:5173"
      - "8000:8000"
      - "8080:8080"
      - "9229:9229"
      - "24678:24678"
    stdin_open: true
    tty: true
    security_opt:
      - no-new-privileges:true

volumes:
  npm_cache_{{PROJECT_NAME}}:
  pip_cache_{{PROJECT_NAME}}:
  venv_{{PROJECT_NAME}}:
  opencode_cache_{{PROJECT_NAME}}:
