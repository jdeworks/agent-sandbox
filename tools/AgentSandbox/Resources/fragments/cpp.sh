########################################
# C/C++: configure build environment
########################################
if [ -f "CMakeLists.txt" ] && [ ! -f "build/CMakeCache.txt" ]; then
    echo "[sandbox] CMake project detected. Run 'cmake -B build' to configure."
fi
