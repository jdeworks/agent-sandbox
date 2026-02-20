########################################
# .NET: restore NuGet packages
########################################
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export NUGET_PACKAGES=/workspace/.nuget/packages

dotnet_project=$(find /workspace/src -maxdepth 2 \( -name "*.csproj" -o -name "*.fsproj" -o -name "*.sln" \) 2>/dev/null | head -1)

if [ -n "$dotnet_project" ]; then
    project_dir=$(dirname "$dotnet_project")
    current_md5=$(find /workspace/src -maxdepth 2 \( -name "*.csproj" -o -name "*.fsproj" \) -exec md5sum {} + 2>/dev/null | sort | md5sum | awk '{print $1}')
    stored_md5=""
    [ -f /workspace/.nuget/.restore.md5 ] && stored_md5=$(cat /workspace/.nuget/.restore.md5)
    if [ "$current_md5" != "$stored_md5" ]; then
        echo "[sandbox] Restoring .NET packages..."
        (cd "$project_dir" && dotnet restore -q)
        echo "$current_md5" > /workspace/.nuget/.restore.md5
    else
        echo "[sandbox] .NET packages up to date."
    fi
fi

[ -d /workspace/.nuget ] && chmod -R a+rwX /workspace/.nuget
