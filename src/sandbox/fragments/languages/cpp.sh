########################################
# C/C++: configure build environment
########################################
if [ -f "/workspace/src/CMakeLists.txt" ] && [ ! -f "/workspace/src/build/CMakeCache.txt" ]; then
    echo "[sandbox] CMake project detected. Run 'cmake -B build' to configure."
fi
