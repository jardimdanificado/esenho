#cmake_minimum_required(VERSION 3.22.1)
cmake_minimum_required(VERSION 3.22.1)
project("esenho_core")

set(CMAKE_C_STANDARD 11)

# Include directories
include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../src/include
    ${CMAKE_CURRENT_SOURCE_DIR}
)

# Source files
set(CORE_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/esenho_jni.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../src/quadro.c
)

add_library(esenho_core SHARED
    ${CORE_SOURCES}
)

# Compile flags
target_compile_options(esenho_core PRIVATE
    -O3
    -Wall
    -Wextra
    -Wno-unused-parameter
    -Wno-missing-field-initializers
    -Wno-misleading-indentation
)

target_link_libraries(esenho_core
    android
    jnigraphics
    log
    m
)
