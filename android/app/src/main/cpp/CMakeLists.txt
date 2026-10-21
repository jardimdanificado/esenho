cmake_minimum_required(VERSION 3.22.1)
project("esenho_core")

set(CMAKE_C_STANDARD 11)

# Independent JS runtime for the native editor. No WebView or browser assets.
add_library(esenho_script SHARED
    esenho_script_jni.c
    vendor/quickjs/quickjs.c
    vendor/quickjs/dtoa.c
    vendor/quickjs/libregexp.c
    vendor/quickjs/libunicode.c
    vendor/quickjs/cutils.c
)
target_include_directories(esenho_script PRIVATE vendor/quickjs)
target_compile_definitions(esenho_script PRIVATE _GNU_SOURCE CONFIG_VERSION="2026-06-04")
target_compile_options(esenho_script PRIVATE -O2)
target_link_libraries(esenho_script m)

# Include directories
include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/gen
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../src/include
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../src/plugins
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../../src/plugins/brushes
)

# Source files
file(GLOB BRUSH_SOURCES CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/gen/brushes/*.c)
file(GLOB FILTER_SOURCES CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/gen/filters/*.c)

set(CORE_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/esenho_jni.c
    ${CMAKE_CURRENT_SOURCE_DIR}/gen/esenho_plugins_registry.c
    ${BRUSH_SOURCES}
    ${FILTER_SOURCES}
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
    -Wno-unused-function
    -Wno-unused-variable
)

target_link_libraries(esenho_core
    android
    jnigraphics
    log
    m
)
