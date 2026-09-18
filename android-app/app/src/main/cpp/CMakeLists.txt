cmake_minimum_required(VERSION 3.22.1)

project("audioengine")

# Enable C++17
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find Google Oboe via Android Gradle Plugin Prefab
find_package(oboe REQUIRED CONFIG)

# Add shared library
add_library(
    audioengine
    SHARED
    native-lib.cpp
    AudioEngine.cpp
    EchoEffect.cpp
    WavEncoder.cpp
)

# Include current source directory
target_include_directories(
    audioengine
    PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
)

# Link Oboe, Android logging, and OpenSLES
target_link_libraries(
    audioengine
    PRIVATE
    oboe::oboe
    log
    OpenSLES
)
