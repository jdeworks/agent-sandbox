# Fragments

Shell snippets that run **inside the Docker container** at startup. They are not executed on the host.

## How they work

During `prepare`, the profile generator (`generate_profile.sh`) reads the selected fragment files and concatenates them into a single `install.sh`. That file is then `COPY`'d into the container image via the `Dockerfile.base` and runs as the container's `ENTRYPOINT` every time the sandbox starts.

```
prepare (host)
  └─ generate_profile.sh reads fragments/python.sh + fragments/node.sh
       └─ writes prepared/<profile>/install.sh
            └─ Dockerfile.base: COPY install.sh /install.sh
                 └─ container startup: /install.sh runs inside the container
```

## File types

| Pattern             | Purpose                                                  |
|---------------------|----------------------------------------------------------|
| `<lang>.sh`         | Container startup script (venv setup, dep install, etc.) |
| `<lang>.agents.md`  | Agent instructions appended to the profile's AGENTS.md   |

## Available languages

| Key      | Label            | Auto-installs from         |
|----------|------------------|----------------------------|
| `cpp`    | C/C++            | _(CMake hint only)_        |
| `dart`   | Dart             | `pubspec.yaml`             |
| `dotnet` | C# / .NET        | `*.csproj` / `*.fsproj`    |
| `go`     | Go               | `go.sum`                   |
| `java`   | Java             | `pom.xml` / `build.gradle` |
| `kotlin` | Kotlin           | `build.gradle(.kts)`       |
| `node`   | Node.js          | `package.json`             |
| `php`    | PHP              | `composer.json`            |
| `python` | Python 3         | `requirements.txt`         |
| `ruby`   | Ruby             | `Gemfile`                  |
| `rust`   | Rust             | `Cargo.lock`               |

## Conventions

Each `.sh` fragment should:

- Start with a section header comment (`########################################`)
- Be idempotent -- safe to run on every container startup
- Use md5 checksums to skip redundant installs (see existing fragments for the pattern)
- Export any PATH additions needed at runtime
- Handle the case where the manifest file does not exist

Each `.agents.md` fragment should:

- Start with a `## <Language> Environment` heading
- Tell the AI agent what it needs to know about the language's setup in this sandbox
- Not repeat generic information already in the base AGENTS.md

## Adding a new language

1. Create `<key>.sh` in this directory matching the key in `languages.json`
2. Create `<key>.agents.md` with environment instructions for the AI agent
3. Add the corresponding entry in `../languages.json` with `label`, `detect`, `dockerfile`, `volumes`, and `path_prepend`
4. Add default ports and any framework entries in `../ports.json`
5. Run `prepare` and select the new language to generate a profile
