services:
  agent:
    build: .
    container_name: sandbox-{{PROJECT_NAME}}
    working_dir: /workspace/src
    environment:
      - HOME=/workspace
      - PATH=/workspace/.venv/bin:/opt/opencode/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
    volumes:
      # User's folder: only code, requirements.txt, package.json (node_modules via volume)
      - {{WORKSPACE_PATH}}:/workspace/src
      # Named volumes for performance
      - venv_{{PROJECT_NAME}}:/workspace/.venv
      - npm_cache_{{PROJECT_NAME}}:/workspace/.npm
      - pip_cache_{{PROJECT_NAME}}:/workspace/.cache/pip
      - ./opencode_data:/workspace/.config/opencode
      - ./opencode_sessions:/workspace/.local/share/opencode
      - opencode_cache_{{PROJECT_NAME}}:/workspace/.cache/opencode
      # Config files (in this repo)
      - ./Agents.md:/workspace/Agents.md:ro
      - ./opencode.json:/workspace/opencode.json
      - ./oh-my-opencode.json:/workspace/.opencode/oh-my-opencode.json
      - ./changes.txt:/workspace/.sandbox/changes.txt
      - ./tmp:/tmp
    # Common dev server ports (add more in project docker-compose.yml if needed)
    ports:
      - "3000:3000"
      - "3001:3001"
      - "4000:4000"
      - "4173:4173"
      - "4200:4200"
      - "5000:5000"
      - "5001:5001"
      - "5173:5173"
      - "5500:5500"
      - "8000:8000"
      - "8080:8080"
      - "8100:8100"
      - "8888:8888"
      - "9000:9000"
      - "9090:9090"
      - "1313:1313"
      - "3333:3333"
      - "3456:3456"
      - "24678:24678"
      - "9229:9229"
    stdin_open: true
    tty: true
    security_opt:
      - no-new-privileges:true

volumes:
  venv_{{PROJECT_NAME}}:
  node_modules_{{PROJECT_NAME}}:
  npm_cache_{{PROJECT_NAME}}:
  pip_cache_{{PROJECT_NAME}}:
  opencode_cache_{{PROJECT_NAME}}:
