/* Auto-generated Plugin Registry Implementation */
#include "esenho_plugins_registry.h"
#include <string.h>

// Forward declarations for brushes

extern const char* brush_aurora_borealis_get_info(void);
extern void brush_aurora_borealis_init(int32_t w, int32_t h);
extern void brush_aurora_borealis_set_param(int32_t idx, int32_t val);
extern void brush_aurora_borealis_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_aurora_borealis_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_aurora_borealis_stroke_end(void);

extern const char* brush_bioluminescence_jellyfish_get_info(void);
extern void brush_bioluminescence_jellyfish_init(int32_t w, int32_t h);
extern void brush_bioluminescence_jellyfish_set_param(int32_t idx, int32_t val);
extern void brush_bioluminescence_jellyfish_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_bioluminescence_jellyfish_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_bioluminescence_jellyfish_stroke_end(void);

extern const char* brush_biomimetic_gecko_setae_get_info(void);
extern void brush_biomimetic_gecko_setae_init(int32_t w, int32_t h);
extern void brush_biomimetic_gecko_setae_set_param(int32_t idx, int32_t val);
extern void brush_biomimetic_gecko_setae_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_biomimetic_gecko_setae_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_biomimetic_gecko_setae_stroke_end(void);

extern const char* brush_bristle_oil_get_info(void);
extern void brush_bristle_oil_init(int32_t w, int32_t h);
extern void brush_bristle_oil_set_param(int32_t idx, int32_t val);
extern void brush_bristle_oil_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_bristle_oil_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_bristle_oil_stroke_end(void);

extern const char* brush_calligraphy_ribbon_get_info(void);
extern void brush_calligraphy_ribbon_init(int32_t w, int32_t h);
extern void brush_calligraphy_ribbon_set_param(int32_t idx, int32_t val);
extern void brush_calligraphy_ribbon_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_calligraphy_ribbon_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_calligraphy_ribbon_stroke_end(void);

extern const char* brush_caustic_water_sunlight_get_info(void);
extern void brush_caustic_water_sunlight_init(int32_t w, int32_t h);
extern void brush_caustic_water_sunlight_set_param(int32_t idx, int32_t val);
extern void brush_caustic_water_sunlight_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_caustic_water_sunlight_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_caustic_water_sunlight_stroke_end(void);

extern const char* brush_cellular_automata_brians_brain_get_info(void);
extern void brush_cellular_automata_brians_brain_init(int32_t w, int32_t h);
extern void brush_cellular_automata_brians_brain_set_param(int32_t idx, int32_t val);
extern void brush_cellular_automata_brians_brain_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_cellular_automata_brians_brain_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_cellular_automata_brians_brain_stroke_end(void);

extern const char* brush_charcoal_chalk_get_info(void);
extern void brush_charcoal_chalk_init(int32_t w, int32_t h);
extern void brush_charcoal_chalk_set_param(int32_t idx, int32_t val);
extern void brush_charcoal_chalk_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_charcoal_chalk_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_charcoal_chalk_stroke_end(void);

extern const char* brush_chromatic_holo_warp_get_info(void);
extern void brush_chromatic_holo_warp_init(int32_t w, int32_t h);
extern void brush_chromatic_holo_warp_set_param(int32_t idx, int32_t val);
extern void brush_chromatic_holo_warp_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_chromatic_holo_warp_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_chromatic_holo_warp_stroke_end(void);

extern const char* brush_colored_pencil_get_info(void);
extern void brush_colored_pencil_init(int32_t w, int32_t h);
extern void brush_colored_pencil_set_param(int32_t idx, int32_t val);
extern void brush_colored_pencil_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_colored_pencil_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_colored_pencil_stroke_end(void);

extern const char* brush_crystal_birefringence_calcite_get_info(void);
extern void brush_crystal_birefringence_calcite_init(int32_t w, int32_t h);
extern void brush_crystal_birefringence_calcite_set_param(int32_t idx, int32_t val);
extern void brush_crystal_birefringence_calcite_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_crystal_birefringence_calcite_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_crystal_birefringence_calcite_stroke_end(void);

extern const char* brush_crystal_growth_dendrite_get_info(void);
extern void brush_crystal_growth_dendrite_init(int32_t w, int32_t h);
extern void brush_crystal_growth_dendrite_set_param(int32_t idx, int32_t val);
extern void brush_crystal_growth_dendrite_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_crystal_growth_dendrite_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_crystal_growth_dendrite_stroke_end(void);

extern const char* brush_dip_pen_get_info(void);
extern void brush_dip_pen_init(int32_t w, int32_t h);
extern void brush_dip_pen_set_param(int32_t idx, int32_t val);
extern void brush_dip_pen_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_dip_pen_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_dip_pen_stroke_end(void);

extern const char* brush_dragon_scale_armor_get_info(void);
extern void brush_dragon_scale_armor_init(int32_t w, int32_t h);
extern void brush_dragon_scale_armor_set_param(int32_t idx, int32_t val);
extern void brush_dragon_scale_armor_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_dragon_scale_armor_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_dragon_scale_armor_stroke_end(void);

extern const char* brush_dry_flat_brush_get_info(void);
extern void brush_dry_flat_brush_init(int32_t w, int32_t h);
extern void brush_dry_flat_brush_set_param(int32_t idx, int32_t val);
extern void brush_dry_flat_brush_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_dry_flat_brush_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_dry_flat_brush_stroke_end(void);

extern const char* brush_drying_pigment_get_info(void);
extern void brush_drying_pigment_init(int32_t w, int32_t h);
extern void brush_drying_pigment_set_param(int32_t idx, int32_t val);
extern void brush_drying_pigment_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_drying_pigment_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_drying_pigment_stroke_end(void);

extern const char* brush_electric_discharge_kirlian_get_info(void);
extern void brush_electric_discharge_kirlian_init(int32_t w, int32_t h);
extern void brush_electric_discharge_kirlian_set_param(int32_t idx, int32_t val);
extern void brush_electric_discharge_kirlian_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_electric_discharge_kirlian_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_electric_discharge_kirlian_stroke_end(void);

extern const char* brush_felt_marker_get_info(void);
extern void brush_felt_marker_init(int32_t w, int32_t h);
extern void brush_felt_marker_set_param(int32_t idx, int32_t val);
extern void brush_felt_marker_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_felt_marker_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_felt_marker_stroke_end(void);

extern const char* brush_ferroelectric_domain_walls_get_info(void);
extern void brush_ferroelectric_domain_walls_init(int32_t w, int32_t h);
extern void brush_ferroelectric_domain_walls_set_param(int32_t idx, int32_t val);
extern void brush_ferroelectric_domain_walls_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_ferroelectric_domain_walls_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_ferroelectric_domain_walls_stroke_end(void);

extern const char* brush_ferrofluid_magnetic_get_info(void);
extern void brush_ferrofluid_magnetic_init(int32_t w, int32_t h);
extern void brush_ferrofluid_magnetic_set_param(int32_t idx, int32_t val);
extern void brush_ferrofluid_magnetic_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_ferrofluid_magnetic_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_ferrofluid_magnetic_stroke_end(void);

extern const char* brush_fiber_optic_strands_get_info(void);
extern void brush_fiber_optic_strands_init(int32_t w, int32_t h);
extern void brush_fiber_optic_strands_set_param(int32_t idx, int32_t val);
extern void brush_fiber_optic_strands_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_fiber_optic_strands_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_fiber_optic_strands_stroke_end(void);

extern const char* brush_fluid_smoke_swirl_get_info(void);
extern void brush_fluid_smoke_swirl_init(int32_t w, int32_t h);
extern void brush_fluid_smoke_swirl_set_param(int32_t idx, int32_t val);
extern void brush_fluid_smoke_swirl_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_fluid_smoke_swirl_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_fluid_smoke_swirl_stroke_end(void);

extern const char* brush_fractal_lightning_get_info(void);
extern void brush_fractal_lightning_init(int32_t w, int32_t h);
extern void brush_fractal_lightning_set_param(int32_t idx, int32_t val);
extern void brush_fractal_lightning_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_fractal_lightning_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_fractal_lightning_stroke_end(void);

extern const char* brush_glitch_datamosh_matrix_get_info(void);
extern void brush_glitch_datamosh_matrix_init(int32_t w, int32_t h);
extern void brush_glitch_datamosh_matrix_set_param(int32_t idx, int32_t val);
extern void brush_glitch_datamosh_matrix_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_glitch_datamosh_matrix_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_glitch_datamosh_matrix_stroke_end(void);

extern const char* brush_gouache_flat_get_info(void);
extern void brush_gouache_flat_init(int32_t w, int32_t h);
extern void brush_gouache_flat_set_param(int32_t idx, int32_t val);
extern void brush_gouache_flat_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_gouache_flat_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_gouache_flat_stroke_end(void);

extern const char* brush_graphite_pencil_get_info(void);
extern void brush_graphite_pencil_init(int32_t w, int32_t h);
extern void brush_graphite_pencil_set_param(int32_t idx, int32_t val);
extern void brush_graphite_pencil_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_graphite_pencil_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_graphite_pencil_stroke_end(void);

extern const char* brush_gravitational_lens_einstein_get_info(void);
extern void brush_gravitational_lens_einstein_init(int32_t w, int32_t h);
extern void brush_gravitational_lens_einstein_set_param(int32_t idx, int32_t val);
extern void brush_gravitational_lens_einstein_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_gravitational_lens_einstein_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_gravitational_lens_einstein_stroke_end(void);

extern const char* brush_gravity_drip_get_info(void);
extern void brush_gravity_drip_init(int32_t w, int32_t h);
extern void brush_gravity_drip_set_param(int32_t idx, int32_t val);
extern void brush_gravity_drip_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_gravity_drip_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_gravity_drip_stroke_end(void);

extern const char* brush_height_relief_get_info(void);
extern void brush_height_relief_init(int32_t w, int32_t h);
extern void brush_height_relief_set_param(int32_t idx, int32_t val);
extern void brush_height_relief_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_height_relief_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_height_relief_stroke_end(void);

extern const char* brush_holographic_interference_get_info(void);
extern void brush_holographic_interference_init(int32_t w, int32_t h);
extern void brush_holographic_interference_set_param(int32_t idx, int32_t val);
extern void brush_holographic_interference_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_holographic_interference_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_holographic_interference_stroke_end(void);

extern const char* brush_holographic_stereogram_get_info(void);
extern void brush_holographic_stereogram_init(int32_t w, int32_t h);
extern void brush_holographic_stereogram_set_param(int32_t idx, int32_t val);
extern void brush_holographic_stereogram_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_holographic_stereogram_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_holographic_stereogram_stroke_end(void);

extern const char* brush_iridescent_soap_bubble_get_info(void);
extern void brush_iridescent_soap_bubble_init(int32_t w, int32_t h);
extern void brush_iridescent_soap_bubble_set_param(int32_t idx, int32_t val);
extern void brush_iridescent_soap_bubble_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_iridescent_soap_bubble_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_iridescent_soap_bubble_stroke_end(void);

extern const char* brush_lichen_symbiosis_get_info(void);
extern void brush_lichen_symbiosis_init(int32_t w, int32_t h);
extern void brush_lichen_symbiosis_set_param(int32_t idx, int32_t val);
extern void brush_lichen_symbiosis_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_lichen_symbiosis_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_lichen_symbiosis_stroke_end(void);

extern const char* brush_liquid_mercury_chrome_get_info(void);
extern void brush_liquid_mercury_chrome_init(int32_t w, int32_t h);
extern void brush_liquid_mercury_chrome_set_param(int32_t idx, int32_t val);
extern void brush_liquid_mercury_chrome_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_liquid_mercury_chrome_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_liquid_mercury_chrome_stroke_end(void);

extern const char* brush_magma_crust_tectonic_get_info(void);
extern void brush_magma_crust_tectonic_init(int32_t w, int32_t h);
extern void brush_magma_crust_tectonic_set_param(int32_t idx, int32_t val);
extern void brush_magma_crust_tectonic_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_magma_crust_tectonic_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_magma_crust_tectonic_stroke_end(void);

extern const char* brush_magnetohydrodynamic_dynamo_get_info(void);
extern void brush_magnetohydrodynamic_dynamo_init(int32_t w, int32_t h);
extern void brush_magnetohydrodynamic_dynamo_set_param(int32_t idx, int32_t val);
extern void brush_magnetohydrodynamic_dynamo_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_magnetohydrodynamic_dynamo_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_magnetohydrodynamic_dynamo_stroke_end(void);

extern const char* brush_metamaterial_invisibility_get_info(void);
extern void brush_metamaterial_invisibility_init(int32_t w, int32_t h);
extern void brush_metamaterial_invisibility_set_param(int32_t idx, int32_t val);
extern void brush_metamaterial_invisibility_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_metamaterial_invisibility_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_metamaterial_invisibility_stroke_end(void);

extern const char* brush_meteor_shower_bolide_get_info(void);
extern void brush_meteor_shower_bolide_init(int32_t w, int32_t h);
extern void brush_meteor_shower_bolide_set_param(int32_t idx, int32_t val);
extern void brush_meteor_shower_bolide_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_meteor_shower_bolide_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_meteor_shower_bolide_stroke_end(void);

extern const char* brush_moire_interference_silk_get_info(void);
extern void brush_moire_interference_silk_init(int32_t w, int32_t h);
extern void brush_moire_interference_silk_set_param(int32_t idx, int32_t val);
extern void brush_moire_interference_silk_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_moire_interference_silk_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_moire_interference_silk_stroke_end(void);

extern const char* brush_mycelium_hyphae_get_info(void);
extern void brush_mycelium_hyphae_init(int32_t w, int32_t h);
extern void brush_mycelium_hyphae_set_param(int32_t idx, int32_t val);
extern void brush_mycelium_hyphae_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_mycelium_hyphae_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_mycelium_hyphae_stroke_end(void);

extern const char* brush_nebula_stellar_birth_get_info(void);
extern void brush_nebula_stellar_birth_init(int32_t w, int32_t h);
extern void brush_nebula_stellar_birth_set_param(int32_t idx, int32_t val);
extern void brush_nebula_stellar_birth_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_nebula_stellar_birth_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_nebula_stellar_birth_stroke_end(void);

extern const char* brush_neon_cyber_circuit_get_info(void);
extern void brush_neon_cyber_circuit_init(int32_t w, int32_t h);
extern void brush_neon_cyber_circuit_set_param(int32_t idx, int32_t val);
extern void brush_neon_cyber_circuit_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_neon_cyber_circuit_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_neon_cyber_circuit_stroke_end(void);

extern const char* brush_neon_glow_get_info(void);
extern void brush_neon_glow_init(int32_t w, int32_t h);
extern void brush_neon_glow_set_param(int32_t idx, int32_t val);
extern void brush_neon_glow_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_neon_glow_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_neon_glow_stroke_end(void);

extern const char* brush_origami_kaleido_get_info(void);
extern void brush_origami_kaleido_init(int32_t w, int32_t h);
extern void brush_origami_kaleido_set_param(int32_t idx, int32_t val);
extern void brush_origami_kaleido_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_origami_kaleido_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_origami_kaleido_stroke_end(void);

extern const char* brush_particle_spray_get_info(void);
extern void brush_particle_spray_init(int32_t w, int32_t h);
extern void brush_particle_spray_set_param(int32_t idx, int32_t val);
extern void brush_particle_spray_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_particle_spray_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_particle_spray_stroke_end(void);

extern const char* brush_peacock_feather_barbules_get_info(void);
extern void brush_peacock_feather_barbules_init(int32_t w, int32_t h);
extern void brush_peacock_feather_barbules_set_param(int32_t idx, int32_t val);
extern void brush_peacock_feather_barbules_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_peacock_feather_barbules_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_peacock_feather_barbules_stroke_end(void);

extern const char* brush_pixel_dither_get_info(void);
extern void brush_pixel_dither_init(int32_t w, int32_t h);
extern void brush_pixel_dither_set_param(int32_t idx, int32_t val);
extern void brush_pixel_dither_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_pixel_dither_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_pixel_dither_stroke_end(void);

extern const char* brush_plasma_ball_arc_get_info(void);
extern void brush_plasma_ball_arc_init(int32_t w, int32_t h);
extern void brush_plasma_ball_arc_set_param(int32_t idx, int32_t val);
extern void brush_plasma_ball_arc_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_plasma_ball_arc_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_plasma_ball_arc_stroke_end(void);

extern const char* brush_prismatic_refract_kaleidoscope_get_info(void);
extern void brush_prismatic_refract_kaleidoscope_init(int32_t w, int32_t h);
extern void brush_prismatic_refract_kaleidoscope_set_param(int32_t idx, int32_t val);
extern void brush_prismatic_refract_kaleidoscope_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_prismatic_refract_kaleidoscope_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_prismatic_refract_kaleidoscope_stroke_end(void);

extern const char* brush_quantum_chroma_tunnel_get_info(void);
extern void brush_quantum_chroma_tunnel_init(int32_t w, int32_t h);
extern void brush_quantum_chroma_tunnel_set_param(int32_t idx, int32_t val);
extern void brush_quantum_chroma_tunnel_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_quantum_chroma_tunnel_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_quantum_chroma_tunnel_stroke_end(void);

extern const char* brush_quantum_probability_cloud_get_info(void);
extern void brush_quantum_probability_cloud_init(int32_t w, int32_t h);
extern void brush_quantum_probability_cloud_set_param(int32_t idx, int32_t val);
extern void brush_quantum_probability_cloud_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_quantum_probability_cloud_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_quantum_probability_cloud_stroke_end(void);

extern const char* brush_radioactive_cloud_chamber_get_info(void);
extern void brush_radioactive_cloud_chamber_init(int32_t w, int32_t h);
extern void brush_radioactive_cloud_chamber_set_param(int32_t idx, int32_t val);
extern void brush_radioactive_cloud_chamber_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_radioactive_cloud_chamber_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_radioactive_cloud_chamber_stroke_end(void);

extern const char* brush_reaction_diffusion_get_info(void);
extern void brush_reaction_diffusion_init(int32_t w, int32_t h);
extern void brush_reaction_diffusion_set_param(int32_t idx, int32_t val);
extern void brush_reaction_diffusion_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_reaction_diffusion_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_reaction_diffusion_stroke_end(void);

extern const char* brush_sand_dune_ripples_get_info(void);
extern void brush_sand_dune_ripples_init(int32_t w, int32_t h);
extern void brush_sand_dune_ripples_set_param(int32_t idx, int32_t val);
extern void brush_sand_dune_ripples_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_sand_dune_ripples_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_sand_dune_ripples_stroke_end(void);

extern const char* brush_sand_sim_get_info(void);
extern void brush_sand_sim_init(int32_t w, int32_t h);
extern void brush_sand_sim_set_param(int32_t idx, int32_t val);
extern void brush_sand_sim_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_sand_sim_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_sand_sim_stroke_end(void);

extern const char* brush_slime_mold_physarum_get_info(void);
extern void brush_slime_mold_physarum_init(int32_t w, int32_t h);
extern void brush_slime_mold_physarum_set_param(int32_t idx, int32_t val);
extern void brush_slime_mold_physarum_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_slime_mold_physarum_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_slime_mold_physarum_stroke_end(void);

extern const char* brush_smoke_ring_vortex_get_info(void);
extern void brush_smoke_ring_vortex_init(int32_t w, int32_t h);
extern void brush_smoke_ring_vortex_set_param(int32_t idx, int32_t val);
extern void brush_smoke_ring_vortex_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_smoke_ring_vortex_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_smoke_ring_vortex_stroke_end(void);

extern const char* brush_soft_pastel_get_info(void);
extern void brush_soft_pastel_init(int32_t w, int32_t h);
extern void brush_soft_pastel_set_param(int32_t idx, int32_t val);
extern void brush_soft_pastel_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_soft_pastel_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_soft_pastel_stroke_end(void);

extern const char* brush_solar_flare_prominence_get_info(void);
extern void brush_solar_flare_prominence_init(int32_t w, int32_t h);
extern void brush_solar_flare_prominence_set_param(int32_t idx, int32_t val);
extern void brush_solar_flare_prominence_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_solar_flare_prominence_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_solar_flare_prominence_stroke_end(void);

extern const char* brush_sonoluminescence_bubble_get_info(void);
extern void brush_sonoluminescence_bubble_init(int32_t w, int32_t h);
extern void brush_sonoluminescence_bubble_set_param(int32_t idx, int32_t val);
extern void brush_sonoluminescence_bubble_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_sonoluminescence_bubble_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_sonoluminescence_bubble_stroke_end(void);

extern const char* brush_soundwave_cymatics_get_info(void);
extern void brush_soundwave_cymatics_init(int32_t w, int32_t h);
extern void brush_soundwave_cymatics_set_param(int32_t idx, int32_t val);
extern void brush_soundwave_cymatics_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_soundwave_cymatics_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_soundwave_cymatics_stroke_end(void);

extern const char* brush_superfluid_helium_vortices_get_info(void);
extern void brush_superfluid_helium_vortices_init(int32_t w, int32_t h);
extern void brush_superfluid_helium_vortices_set_param(int32_t idx, int32_t val);
extern void brush_superfluid_helium_vortices_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_superfluid_helium_vortices_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_superfluid_helium_vortices_stroke_end(void);

extern const char* brush_supernova_shockwave_get_info(void);
extern void brush_supernova_shockwave_init(int32_t w, int32_t h);
extern void brush_supernova_shockwave_set_param(int32_t idx, int32_t val);
extern void brush_supernova_shockwave_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_supernova_shockwave_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_supernova_shockwave_stroke_end(void);

extern const char* brush_thermal_pyro_get_info(void);
extern void brush_thermal_pyro_init(int32_t w, int32_t h);
extern void brush_thermal_pyro_set_param(int32_t idx, int32_t val);
extern void brush_thermal_pyro_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_thermal_pyro_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_thermal_pyro_stroke_end(void);

extern const char* brush_topographic_contour_isolines_get_info(void);
extern void brush_topographic_contour_isolines_init(int32_t w, int32_t h);
extern void brush_topographic_contour_isolines_set_param(int32_t idx, int32_t val);
extern void brush_topographic_contour_isolines_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_topographic_contour_isolines_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_topographic_contour_isolines_stroke_end(void);

extern const char* brush_voronoi_mosaic_get_info(void);
extern void brush_voronoi_mosaic_init(int32_t w, int32_t h);
extern void brush_voronoi_mosaic_set_param(int32_t idx, int32_t val);
extern void brush_voronoi_mosaic_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_voronoi_mosaic_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_voronoi_mosaic_stroke_end(void);

extern const char* brush_watercolor_bleed_get_info(void);
extern void brush_watercolor_bleed_init(int32_t w, int32_t h);
extern void brush_watercolor_bleed_set_param(int32_t idx, int32_t val);
extern void brush_watercolor_bleed_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_watercolor_bleed_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_watercolor_bleed_stroke_end(void);

extern const char* brush_wax_crayon_get_info(void);
extern void brush_wax_crayon_init(int32_t w, int32_t h);
extern void brush_wax_crayon_set_param(int32_t idx, int32_t val);
extern void brush_wax_crayon_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_wax_crayon_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_wax_crayon_stroke_end(void);

extern const char* brush_xray_radiography_bone_get_info(void);
extern void brush_xray_radiography_bone_init(int32_t w, int32_t h);
extern void brush_xray_radiography_bone_set_param(int32_t idx, int32_t val);
extern void brush_xray_radiography_bone_stroke_begin(float x, float y, float pressure, float tilt_x, float tilt_y, uint32_t color, int32_t is_eraser);
extern void brush_xray_radiography_bone_render_dab(uint32_t *pixels, int32_t cw, int32_t ch, float cx, float cy, float radius, float pressure, float angle_deg, float speed, uint32_t color, int32_t is_eraser);
extern void brush_xray_radiography_bone_stroke_end(void);


// Forward declarations for filters

extern const char* filter_bloom_get_info(void);
extern void filter_bloom_apply(int32_t p1, int32_t p2);

extern const char* filter_blur_get_info(void);
extern void filter_blur_apply(int32_t p1, int32_t p2);

extern const char* filter_brightness_get_info(void);
extern void filter_brightness_apply(int32_t p1, int32_t p2);

extern const char* filter_chromatic_get_info(void);
extern void filter_chromatic_apply(int32_t p1, int32_t p2);

extern const char* filter_contrast_get_info(void);
extern void filter_contrast_apply(int32_t p1, int32_t p2);

extern const char* filter_dither_get_info(void);
extern void filter_dither_apply(int32_t p1, int32_t p2);

extern const char* filter_duotone_get_info(void);
extern void filter_duotone_apply(int32_t p1, int32_t p2);

extern const char* filter_edge_get_info(void);
extern void filter_edge_apply(int32_t p1, int32_t p2);

extern const char* filter_emboss_get_info(void);
extern void filter_emboss_apply(int32_t p1, int32_t p2);

extern const char* filter_fisheye_get_info(void);
extern void filter_fisheye_apply(int32_t p1, int32_t p2);

extern const char* filter_frosted_glass_get_info(void);
extern void filter_frosted_glass_apply(int32_t p1, int32_t p2);

extern const char* filter_glitch_get_info(void);
extern void filter_glitch_apply(int32_t p1, int32_t p2);

extern const char* filter_grayscale_get_info(void);
extern void filter_grayscale_apply(int32_t p1, int32_t p2);

extern const char* filter_halftone_dot_get_info(void);
extern void filter_halftone_dot_apply(int32_t p1, int32_t p2);

extern const char* filter_invert_get_info(void);
extern void filter_invert_apply(int32_t p1, int32_t p2);

extern const char* filter_kaleidoscope_get_info(void);
extern void filter_kaleidoscope_apply(int32_t p1, int32_t p2);

extern const char* filter_kuwahara_get_info(void);
extern void filter_kuwahara_apply(int32_t p1, int32_t p2);

extern const char* filter_noise_get_info(void);
extern void filter_noise_apply(int32_t p1, int32_t p2);

extern const char* filter_pixelate_get_info(void);
extern void filter_pixelate_apply(int32_t p1, int32_t p2);

extern const char* filter_ripple_get_info(void);
extern void filter_ripple_apply(int32_t p1, int32_t p2);

extern const char* filter_scanline_get_info(void);
extern void filter_scanline_apply(int32_t p1, int32_t p2);

extern const char* filter_sepia_get_info(void);
extern void filter_sepia_apply(int32_t p1, int32_t p2);

extern const char* filter_sharpen_get_info(void);
extern void filter_sharpen_apply(int32_t p1, int32_t p2);

extern const char* filter_solarize_get_info(void);
extern void filter_solarize_apply(int32_t p1, int32_t p2);

extern const char* filter_swirl_get_info(void);
extern void filter_swirl_apply(int32_t p1, int32_t p2);

extern const char* filter_thermal_get_info(void);
extern void filter_thermal_apply(int32_t p1, int32_t p2);

extern const char* filter_threshold_get_info(void);
extern void filter_threshold_apply(int32_t p1, int32_t p2);

extern const char* filter_vignette_get_info(void);
extern void filter_vignette_apply(int32_t p1, int32_t p2);

extern const char* filter_water_foam_get_info(void);
extern void filter_water_foam_apply(int32_t p1, int32_t p2);


static const native_brush_t s_brushes[] = {
    {
        "aurora_borealis",
        "Aurora Borealis Curtains",
        "Atmospheric",
        0.0500f,
        8.00f,
        160.00f,
        brush_aurora_borealis_get_info,
        brush_aurora_borealis_init,
        brush_aurora_borealis_set_param,
        brush_aurora_borealis_stroke_begin,
        brush_aurora_borealis_render_dab,
        brush_aurora_borealis_stroke_end
    },
    {
        "bioluminescence_jellyfish",
        "Bioluminescent Medusa",
        "Abyssal Bio",
        0.0600f,
        6.00f,
        140.00f,
        brush_bioluminescence_jellyfish_get_info,
        brush_bioluminescence_jellyfish_init,
        brush_bioluminescence_jellyfish_set_param,
        brush_bioluminescence_jellyfish_stroke_begin,
        brush_bioluminescence_jellyfish_render_dab,
        brush_bioluminescence_jellyfish_stroke_end
    },
    {
        "biomimetic_gecko_setae",
        "Gecko Adhesion Setae",
        "Biomimetics",
        0.0500f,
        6.00f,
        140.00f,
        brush_biomimetic_gecko_setae_get_info,
        brush_biomimetic_gecko_setae_init,
        brush_biomimetic_gecko_setae_set_param,
        brush_biomimetic_gecko_setae_stroke_begin,
        brush_biomimetic_gecko_setae_render_dab,
        brush_biomimetic_gecko_setae_stroke_end
    },
    {
        "bristle_oil",
        "Bristle Oil Paint",
        "Paint",
        0.0250f,
        4.00f,
        120.00f,
        brush_bristle_oil_get_info,
        brush_bristle_oil_init,
        brush_bristle_oil_set_param,
        brush_bristle_oil_stroke_begin,
        brush_bristle_oil_render_dab,
        brush_bristle_oil_stroke_end
    },
    {
        "calligraphy_ribbon",
        "Calligraphy Ribbon Nib",
        "Inking",
        0.0400f,
        4.00f,
        100.00f,
        brush_calligraphy_ribbon_get_info,
        brush_calligraphy_ribbon_init,
        brush_calligraphy_ribbon_set_param,
        brush_calligraphy_ribbon_stroke_begin,
        brush_calligraphy_ribbon_render_dab,
        brush_calligraphy_ribbon_stroke_end
    },
    {
        "caustic_water_sunlight",
        "Underwater Sun Caustics",
        "Aquatic",
        0.0500f,
        6.00f,
        150.00f,
        brush_caustic_water_sunlight_get_info,
        brush_caustic_water_sunlight_init,
        brush_caustic_water_sunlight_set_param,
        brush_caustic_water_sunlight_stroke_begin,
        brush_caustic_water_sunlight_render_dab,
        brush_caustic_water_sunlight_stroke_end
    },
    {
        "cellular_automata_brians_brain",
        "Brian's Brain Automaton",
        "Complexity",
        0.0500f,
        6.00f,
        140.00f,
        brush_cellular_automata_brians_brain_get_info,
        brush_cellular_automata_brians_brain_init,
        brush_cellular_automata_brians_brain_set_param,
        brush_cellular_automata_brians_brain_stroke_begin,
        brush_cellular_automata_brians_brain_render_dab,
        brush_cellular_automata_brians_brain_stroke_end
    },
    {
        "charcoal_chalk",
        "Charcoal & Rough Chalk",
        "Sketch",
        0.0500f,
        4.00f,
        120.00f,
        brush_charcoal_chalk_get_info,
        brush_charcoal_chalk_init,
        brush_charcoal_chalk_set_param,
        brush_charcoal_chalk_stroke_begin,
        brush_charcoal_chalk_render_dab,
        brush_charcoal_chalk_stroke_end
    },
    {
        "chromatic_holo_warp",
        "Molten Mercury Holograph",
        "Optics & Liquid",
        0.0500f,
        5.00f,
        150.00f,
        brush_chromatic_holo_warp_get_info,
        brush_chromatic_holo_warp_init,
        brush_chromatic_holo_warp_set_param,
        brush_chromatic_holo_warp_stroke_begin,
        brush_chromatic_holo_warp_render_dab,
        brush_chromatic_holo_warp_stroke_end
    },
    {
        "colored_pencil",
        "Layered Colored Pencil",
        "Sketch",
        0.0700f,
        1.00f,
        80.00f,
        brush_colored_pencil_get_info,
        brush_colored_pencil_init,
        brush_colored_pencil_set_param,
        brush_colored_pencil_stroke_begin,
        brush_colored_pencil_render_dab,
        brush_colored_pencil_stroke_end
    },
    {
        "crystal_birefringence_calcite",
        "Calcite Double Refraction",
        "Mineral Optics",
        0.0500f,
        6.00f,
        140.00f,
        brush_crystal_birefringence_calcite_get_info,
        brush_crystal_birefringence_calcite_init,
        brush_crystal_birefringence_calcite_set_param,
        brush_crystal_birefringence_calcite_stroke_begin,
        brush_crystal_birefringence_calcite_render_dab,
        brush_crystal_birefringence_calcite_stroke_end
    },
    {
        "crystal_growth_dendrite",
        "Hexagonal Ice Dendrite",
        "Crystalline",
        0.0600f,
        6.00f,
        140.00f,
        brush_crystal_growth_dendrite_get_info,
        brush_crystal_growth_dendrite_init,
        brush_crystal_growth_dendrite_set_param,
        brush_crystal_growth_dendrite_stroke_begin,
        brush_crystal_growth_dendrite_render_dab,
        brush_crystal_growth_dendrite_stroke_end
    },
    {
        "dip_pen",
        "Flexible Dip Pen",
        "Inking",
        0.0400f,
        1.00f,
        80.00f,
        brush_dip_pen_get_info,
        brush_dip_pen_init,
        brush_dip_pen_set_param,
        brush_dip_pen_stroke_begin,
        brush_dip_pen_render_dab,
        brush_dip_pen_stroke_end
    },
    {
        "dragon_scale_armor",
        "Dragon Scale Armor",
        "Creature FX",
        0.0500f,
        8.00f,
        160.00f,
        brush_dragon_scale_armor_get_info,
        brush_dragon_scale_armor_init,
        brush_dragon_scale_armor_set_param,
        brush_dragon_scale_armor_stroke_begin,
        brush_dragon_scale_armor_render_dab,
        brush_dragon_scale_armor_stroke_end
    },
    {
        "dry_flat_brush",
        "Dry Bristle Brush",
        "Paint",
        0.0700f,
        2.00f,
        140.00f,
        brush_dry_flat_brush_get_info,
        brush_dry_flat_brush_init,
        brush_dry_flat_brush_set_param,
        brush_dry_flat_brush_stroke_begin,
        brush_dry_flat_brush_render_dab,
        brush_dry_flat_brush_stroke_end
    },
    {
        "drying_pigment",
        "Drying Pigment",
        "Paint Physics",
        0.0500f,
        2.00f,
        120.00f,
        brush_drying_pigment_get_info,
        brush_drying_pigment_init,
        brush_drying_pigment_set_param,
        brush_drying_pigment_stroke_begin,
        brush_drying_pigment_render_dab,
        brush_drying_pigment_stroke_end
    },
    {
        "electric_discharge_kirlian",
        "Kirlian Corona Bio-Aura",
        "Bio-Electrical",
        0.0500f,
        6.00f,
        140.00f,
        brush_electric_discharge_kirlian_get_info,
        brush_electric_discharge_kirlian_init,
        brush_electric_discharge_kirlian_set_param,
        brush_electric_discharge_kirlian_stroke_begin,
        brush_electric_discharge_kirlian_render_dab,
        brush_electric_discharge_kirlian_stroke_end
    },
    {
        "felt_marker",
        "Translucent Chisel Marker",
        "Paint",
        0.0800f,
        2.00f,
        140.00f,
        brush_felt_marker_get_info,
        brush_felt_marker_init,
        brush_felt_marker_set_param,
        brush_felt_marker_stroke_begin,
        brush_felt_marker_render_dab,
        brush_felt_marker_stroke_end
    },
    {
        "ferroelectric_domain_walls",
        "Ferroelectric Domain Walls",
        "Solid State",
        0.0500f,
        6.00f,
        140.00f,
        brush_ferroelectric_domain_walls_get_info,
        brush_ferroelectric_domain_walls_init,
        brush_ferroelectric_domain_walls_set_param,
        brush_ferroelectric_domain_walls_stroke_begin,
        brush_ferroelectric_domain_walls_render_dab,
        brush_ferroelectric_domain_walls_stroke_end
    },
    {
        "ferrofluid_magnetic",
        "Ferrofluid Magnetic Spikes",
        "Magnetic Physics",
        0.0500f,
        6.00f,
        150.00f,
        brush_ferrofluid_magnetic_get_info,
        brush_ferrofluid_magnetic_init,
        brush_ferrofluid_magnetic_set_param,
        brush_ferrofluid_magnetic_stroke_begin,
        brush_ferrofluid_magnetic_render_dab,
        brush_ferrofluid_magnetic_stroke_end
    },
    {
        "fiber_optic_strands",
        "Illuminated Fiber Optics",
        "Optics",
        0.0500f,
        6.00f,
        140.00f,
        brush_fiber_optic_strands_get_info,
        brush_fiber_optic_strands_init,
        brush_fiber_optic_strands_set_param,
        brush_fiber_optic_strands_stroke_begin,
        brush_fiber_optic_strands_render_dab,
        brush_fiber_optic_strands_stroke_end
    },
    {
        "fluid_smoke_swirl",
        "Navier-Stokes Fluid Swirl",
        "Fluid Dynamics",
        0.0500f,
        4.00f,
        140.00f,
        brush_fluid_smoke_swirl_get_info,
        brush_fluid_smoke_swirl_init,
        brush_fluid_smoke_swirl_set_param,
        brush_fluid_smoke_swirl_stroke_begin,
        brush_fluid_smoke_swirl_render_dab,
        brush_fluid_smoke_swirl_stroke_end
    },
    {
        "fractal_lightning",
        "Lichtenberg Lightning Bolt",
        "Physical Simulation",
        0.0800f,
        4.00f,
        120.00f,
        brush_fractal_lightning_get_info,
        brush_fractal_lightning_init,
        brush_fractal_lightning_set_param,
        brush_fractal_lightning_stroke_begin,
        brush_fractal_lightning_render_dab,
        brush_fractal_lightning_stroke_end
    },
    {
        "glitch_datamosh_matrix",
        "Datamosh Glitch Matrix",
        "Digital FX",
        0.0600f,
        8.00f,
        160.00f,
        brush_glitch_datamosh_matrix_get_info,
        brush_glitch_datamosh_matrix_init,
        brush_glitch_datamosh_matrix_set_param,
        brush_glitch_datamosh_matrix_stroke_begin,
        brush_glitch_datamosh_matrix_render_dab,
        brush_glitch_datamosh_matrix_stroke_end
    },
    {
        "gouache_flat",
        "Gouache Flat Brush",
        "Paint",
        0.0700f,
        2.00f,
        140.00f,
        brush_gouache_flat_get_info,
        brush_gouache_flat_init,
        brush_gouache_flat_set_param,
        brush_gouache_flat_stroke_begin,
        brush_gouache_flat_render_dab,
        brush_gouache_flat_stroke_end
    },
    {
        "graphite_pencil",
        "Graphite Pencil HB–6B",
        "Sketch",
        0.0700f,
        1.00f,
        80.00f,
        brush_graphite_pencil_get_info,
        brush_graphite_pencil_init,
        brush_graphite_pencil_set_param,
        brush_graphite_pencil_stroke_begin,
        brush_graphite_pencil_render_dab,
        brush_graphite_pencil_stroke_end
    },
    {
        "gravitational_lens_einstein",
        "Einstein Gravitational Lens",
        "Relativity",
        0.0500f,
        8.00f,
        160.00f,
        brush_gravitational_lens_einstein_get_info,
        brush_gravitational_lens_einstein_init,
        brush_gravitational_lens_einstein_set_param,
        brush_gravitational_lens_einstein_stroke_begin,
        brush_gravitational_lens_einstein_render_dab,
        brush_gravitational_lens_einstein_stroke_end
    },
    {
        "gravity_drip",
        "Gravity Drip Paint",
        "Paint Physics",
        0.0400f,
        3.00f,
        100.00f,
        brush_gravity_drip_get_info,
        brush_gravity_drip_init,
        brush_gravity_drip_set_param,
        brush_gravity_drip_stroke_begin,
        brush_gravity_drip_render_dab,
        brush_gravity_drip_stroke_end
    },
    {
        "height_relief",
        "Accumulating Height Relief",
        "Impasto",
        0.0400f,
        2.00f,
        120.00f,
        brush_height_relief_get_info,
        brush_height_relief_init,
        brush_height_relief_set_param,
        brush_height_relief_stroke_begin,
        brush_height_relief_render_dab,
        brush_height_relief_stroke_end
    },
    {
        "holographic_interference",
        "Diffraction Rainbow Foil",
        "Optics",
        0.0500f,
        5.00f,
        150.00f,
        brush_holographic_interference_get_info,
        brush_holographic_interference_init,
        brush_holographic_interference_set_param,
        brush_holographic_interference_stroke_begin,
        brush_holographic_interference_render_dab,
        brush_holographic_interference_stroke_end
    },
    {
        "holographic_stereogram",
        "Autostereogram Lenticular",
        "Holography",
        0.0500f,
        6.00f,
        140.00f,
        brush_holographic_stereogram_get_info,
        brush_holographic_stereogram_init,
        brush_holographic_stereogram_set_param,
        brush_holographic_stereogram_stroke_begin,
        brush_holographic_stereogram_render_dab,
        brush_holographic_stereogram_stroke_end
    },
    {
        "iridescent_soap_bubble",
        "Iridescent Soap Bubbles",
        "Optics",
        0.0600f,
        8.00f,
        160.00f,
        brush_iridescent_soap_bubble_get_info,
        brush_iridescent_soap_bubble_init,
        brush_iridescent_soap_bubble_set_param,
        brush_iridescent_soap_bubble_stroke_begin,
        brush_iridescent_soap_bubble_render_dab,
        brush_iridescent_soap_bubble_stroke_end
    },
    {
        "lichen_symbiosis",
        "Symbiotic Lichen Colony",
        "Botanical",
        0.0500f,
        6.00f,
        150.00f,
        brush_lichen_symbiosis_get_info,
        brush_lichen_symbiosis_init,
        brush_lichen_symbiosis_set_param,
        brush_lichen_symbiosis_stroke_begin,
        brush_lichen_symbiosis_render_dab,
        brush_lichen_symbiosis_stroke_end
    },
    {
        "liquid_mercury_chrome",
        "Molten Liquid Mercury",
        "Fluid Metal",
        0.0500f,
        5.00f,
        140.00f,
        brush_liquid_mercury_chrome_get_info,
        brush_liquid_mercury_chrome_init,
        brush_liquid_mercury_chrome_set_param,
        brush_liquid_mercury_chrome_stroke_begin,
        brush_liquid_mercury_chrome_render_dab,
        brush_liquid_mercury_chrome_stroke_end
    },
    {
        "magma_crust_tectonic",
        "Volcanic Magma Fissures",
        "Geology",
        0.0500f,
        6.00f,
        140.00f,
        brush_magma_crust_tectonic_get_info,
        brush_magma_crust_tectonic_init,
        brush_magma_crust_tectonic_set_param,
        brush_magma_crust_tectonic_stroke_begin,
        brush_magma_crust_tectonic_render_dab,
        brush_magma_crust_tectonic_stroke_end
    },
    {
        "magnetohydrodynamic_dynamo",
        "Planetary Geodynamo Plasma",
        "Geophysics",
        0.0500f,
        8.00f,
        160.00f,
        brush_magnetohydrodynamic_dynamo_get_info,
        brush_magnetohydrodynamic_dynamo_init,
        brush_magnetohydrodynamic_dynamo_set_param,
        brush_magnetohydrodynamic_dynamo_stroke_begin,
        brush_magnetohydrodynamic_dynamo_render_dab,
        brush_magnetohydrodynamic_dynamo_stroke_end
    },
    {
        "metamaterial_invisibility",
        "Metamaterial Invisibility Cloak",
        "Metamaterials",
        0.0500f,
        8.00f,
        160.00f,
        brush_metamaterial_invisibility_get_info,
        brush_metamaterial_invisibility_init,
        brush_metamaterial_invisibility_set_param,
        brush_metamaterial_invisibility_stroke_begin,
        brush_metamaterial_invisibility_render_dab,
        brush_metamaterial_invisibility_stroke_end
    },
    {
        "meteor_shower_bolide",
        "Hypersonic Meteor Bolide",
        "Astronomy",
        0.0500f,
        6.00f,
        140.00f,
        brush_meteor_shower_bolide_get_info,
        brush_meteor_shower_bolide_init,
        brush_meteor_shower_bolide_set_param,
        brush_meteor_shower_bolide_stroke_begin,
        brush_meteor_shower_bolide_render_dab,
        brush_meteor_shower_bolide_stroke_end
    },
    {
        "moire_interference_silk",
        "Woven Silk Moiré Waves",
        "Textiles",
        0.0500f,
        6.00f,
        150.00f,
        brush_moire_interference_silk_get_info,
        brush_moire_interference_silk_init,
        brush_moire_interference_silk_set_param,
        brush_moire_interference_silk_stroke_begin,
        brush_moire_interference_silk_render_dab,
        brush_moire_interference_silk_stroke_end
    },
    {
        "mycelium_hyphae",
        "Bioluminescent Mycelium",
        "Living Simulation",
        0.0500f,
        5.00f,
        140.00f,
        brush_mycelium_hyphae_get_info,
        brush_mycelium_hyphae_init,
        brush_mycelium_hyphae_set_param,
        brush_mycelium_hyphae_stroke_begin,
        brush_mycelium_hyphae_render_dab,
        brush_mycelium_hyphae_stroke_end
    },
    {
        "nebula_stellar_birth",
        "Cosmic Stellar Cradle",
        "Cosmic",
        0.0500f,
        8.00f,
        160.00f,
        brush_nebula_stellar_birth_get_info,
        brush_nebula_stellar_birth_init,
        brush_nebula_stellar_birth_set_param,
        brush_nebula_stellar_birth_stroke_begin,
        brush_nebula_stellar_birth_render_dab,
        brush_nebula_stellar_birth_stroke_end
    },
    {
        "neon_cyber_circuit",
        "Cybernetic PCB Traces",
        "Cyberpunk",
        0.0500f,
        6.00f,
        140.00f,
        brush_neon_cyber_circuit_get_info,
        brush_neon_cyber_circuit_init,
        brush_neon_cyber_circuit_set_param,
        brush_neon_cyber_circuit_stroke_begin,
        brush_neon_cyber_circuit_render_dab,
        brush_neon_cyber_circuit_stroke_end
    },
    {
        "neon_glow",
        "Neon Glow & Plasma",
        "Special FX",
        0.0500f,
        4.00f,
        140.00f,
        brush_neon_glow_get_info,
        brush_neon_glow_init,
        brush_neon_glow_set_param,
        brush_neon_glow_stroke_begin,
        brush_neon_glow_render_dab,
        brush_neon_glow_stroke_end
    },
    {
        "origami_kaleido",
        "Poincare Origami Kaleidoscope",
        "Sacred Geometry",
        0.0500f,
        8.00f,
        180.00f,
        brush_origami_kaleido_get_info,
        brush_origami_kaleido_init,
        brush_origami_kaleido_set_param,
        brush_origami_kaleido_stroke_begin,
        brush_origami_kaleido_render_dab,
        brush_origami_kaleido_stroke_end
    },
    {
        "particle_spray",
        "Particle Airbrush Splatter",
        "Airbrush",
        0.0500f,
        8.00f,
        150.00f,
        brush_particle_spray_get_info,
        brush_particle_spray_init,
        brush_particle_spray_set_param,
        brush_particle_spray_stroke_begin,
        brush_particle_spray_render_dab,
        brush_particle_spray_stroke_end
    },
    {
        "peacock_feather_barbules",
        "Peacock Feather Eyespot",
        "Photonic Bio",
        0.0500f,
        8.00f,
        160.00f,
        brush_peacock_feather_barbules_get_info,
        brush_peacock_feather_barbules_init,
        brush_peacock_feather_barbules_set_param,
        brush_peacock_feather_barbules_stroke_begin,
        brush_peacock_feather_barbules_render_dab,
        brush_peacock_feather_barbules_stroke_end
    },
    {
        "pixel_dither",
        "Pixel Dither Shading",
        "Pixel Art",
        0.0500f,
        2.00f,
        80.00f,
        brush_pixel_dither_get_info,
        brush_pixel_dither_init,
        brush_pixel_dither_set_param,
        brush_pixel_dither_stroke_begin,
        brush_pixel_dither_render_dab,
        brush_pixel_dither_stroke_end
    },
    {
        "plasma_ball_arc",
        "Tesla Plasma Globe",
        "Electrical",
        0.0600f,
        6.00f,
        140.00f,
        brush_plasma_ball_arc_get_info,
        brush_plasma_ball_arc_init,
        brush_plasma_ball_arc_set_param,
        brush_plasma_ball_arc_stroke_begin,
        brush_plasma_ball_arc_render_dab,
        brush_plasma_ball_arc_stroke_end
    },
    {
        "prismatic_refract_kaleidoscope",
        "Specular Mirror Kaleidoscope",
        "Geometric Optics",
        0.0500f,
        8.00f,
        160.00f,
        brush_prismatic_refract_kaleidoscope_get_info,
        brush_prismatic_refract_kaleidoscope_init,
        brush_prismatic_refract_kaleidoscope_set_param,
        brush_prismatic_refract_kaleidoscope_stroke_begin,
        brush_prismatic_refract_kaleidoscope_render_dab,
        brush_prismatic_refract_kaleidoscope_stroke_end
    },
    {
        "quantum_chroma_tunnel",
        "Quantum Event Horizon Lensing",
        "Astrophysics VFX",
        0.0500f,
        6.00f,
        160.00f,
        brush_quantum_chroma_tunnel_get_info,
        brush_quantum_chroma_tunnel_init,
        brush_quantum_chroma_tunnel_set_param,
        brush_quantum_chroma_tunnel_stroke_begin,
        brush_quantum_chroma_tunnel_render_dab,
        brush_quantum_chroma_tunnel_stroke_end
    },
    {
        "quantum_probability_cloud",
        "Quantum Probability Orbital",
        "Quantum Physics",
        0.0500f,
        6.00f,
        150.00f,
        brush_quantum_probability_cloud_get_info,
        brush_quantum_probability_cloud_init,
        brush_quantum_probability_cloud_set_param,
        brush_quantum_probability_cloud_stroke_begin,
        brush_quantum_probability_cloud_render_dab,
        brush_quantum_probability_cloud_stroke_end
    },
    {
        "radioactive_cloud_chamber",
        "Wilson Cloud Chamber",
        "Nuclear Physics",
        0.0500f,
        8.00f,
        160.00f,
        brush_radioactive_cloud_chamber_get_info,
        brush_radioactive_cloud_chamber_init,
        brush_radioactive_cloud_chamber_set_param,
        brush_radioactive_cloud_chamber_stroke_begin,
        brush_radioactive_cloud_chamber_render_dab,
        brush_radioactive_cloud_chamber_stroke_end
    },
    {
        "reaction_diffusion",
        "Turing Reaction-Diffusion",
        "Organic Simulation",
        0.0500f,
        6.00f,
        160.00f,
        brush_reaction_diffusion_get_info,
        brush_reaction_diffusion_init,
        brush_reaction_diffusion_set_param,
        brush_reaction_diffusion_stroke_begin,
        brush_reaction_diffusion_render_dab,
        brush_reaction_diffusion_stroke_end
    },
    {
        "sand_dune_ripples",
        "Desert Sand Dune Ripples",
        "Sedimentary",
        0.0500f,
        8.00f,
        160.00f,
        brush_sand_dune_ripples_get_info,
        brush_sand_dune_ripples_init,
        brush_sand_dune_ripples_set_param,
        brush_sand_dune_ripples_stroke_begin,
        brush_sand_dune_ripples_render_dab,
        brush_sand_dune_ripples_stroke_end
    },
    {
        "sand_sim",
        "Falling Sand Physics",
        "Special FX",
        0.0500f,
        6.00f,
        100.00f,
        brush_sand_sim_get_info,
        brush_sand_sim_init,
        brush_sand_sim_set_param,
        brush_sand_sim_stroke_begin,
        brush_sand_sim_render_dab,
        brush_sand_sim_stroke_end
    },
    {
        "slime_mold_physarum",
        "Physarum Slime Bio-Network",
        "Bio-Simulation",
        0.0500f,
        6.00f,
        130.00f,
        brush_slime_mold_physarum_get_info,
        brush_slime_mold_physarum_init,
        brush_slime_mold_physarum_set_param,
        brush_slime_mold_physarum_stroke_begin,
        brush_slime_mold_physarum_render_dab,
        brush_slime_mold_physarum_stroke_end
    },
    {
        "smoke_ring_vortex",
        "Toroidal Vortex Smoke Ring",
        "Fluid Dynamics",
        0.0500f,
        8.00f,
        160.00f,
        brush_smoke_ring_vortex_get_info,
        brush_smoke_ring_vortex_init,
        brush_smoke_ring_vortex_set_param,
        brush_smoke_ring_vortex_stroke_begin,
        brush_smoke_ring_vortex_render_dab,
        brush_smoke_ring_vortex_stroke_end
    },
    {
        "soft_pastel",
        "Soft Pastel Stick",
        "Sketch",
        0.0800f,
        2.00f,
        120.00f,
        brush_soft_pastel_get_info,
        brush_soft_pastel_init,
        brush_soft_pastel_set_param,
        brush_soft_pastel_stroke_begin,
        brush_soft_pastel_render_dab,
        brush_soft_pastel_stroke_end
    },
    {
        "solar_flare_prominence",
        "Solar Coronal Prominence",
        "Heliophysics",
        0.0500f,
        8.00f,
        160.00f,
        brush_solar_flare_prominence_get_info,
        brush_solar_flare_prominence_init,
        brush_solar_flare_prominence_set_param,
        brush_solar_flare_prominence_stroke_begin,
        brush_solar_flare_prominence_render_dab,
        brush_solar_flare_prominence_stroke_end
    },
    {
        "sonoluminescence_bubble",
        "Sonoluminescence Flash",
        "Acousto-Optics",
        0.0500f,
        6.00f,
        140.00f,
        brush_sonoluminescence_bubble_get_info,
        brush_sonoluminescence_bubble_init,
        brush_sonoluminescence_bubble_set_param,
        brush_sonoluminescence_bubble_stroke_begin,
        brush_sonoluminescence_bubble_render_dab,
        brush_sonoluminescence_bubble_stroke_end
    },
    {
        "soundwave_cymatics",
        "Chladni Acoustic Cymatics",
        "Acoustics",
        0.0500f,
        6.00f,
        150.00f,
        brush_soundwave_cymatics_get_info,
        brush_soundwave_cymatics_init,
        brush_soundwave_cymatics_set_param,
        brush_soundwave_cymatics_stroke_begin,
        brush_soundwave_cymatics_render_dab,
        brush_soundwave_cymatics_stroke_end
    },
    {
        "superfluid_helium_vortices",
        "Superfluid Quantum Vortices",
        "Quantum Fluid",
        0.0500f,
        6.00f,
        140.00f,
        brush_superfluid_helium_vortices_get_info,
        brush_superfluid_helium_vortices_init,
        brush_superfluid_helium_vortices_set_param,
        brush_superfluid_helium_vortices_stroke_begin,
        brush_superfluid_helium_vortices_render_dab,
        brush_superfluid_helium_vortices_stroke_end
    },
    {
        "supernova_shockwave",
        "Supernova Shockwave",
        "Astrophysics",
        0.0600f,
        8.00f,
        160.00f,
        brush_supernova_shockwave_get_info,
        brush_supernova_shockwave_init,
        brush_supernova_shockwave_set_param,
        brush_supernova_shockwave_stroke_begin,
        brush_supernova_shockwave_render_dab,
        brush_supernova_shockwave_stroke_end
    },
    {
        "thermal_pyro",
        "Blackbody Pyro Heat",
        "Thermodynamics",
        0.0500f,
        5.00f,
        150.00f,
        brush_thermal_pyro_get_info,
        brush_thermal_pyro_init,
        brush_thermal_pyro_set_param,
        brush_thermal_pyro_stroke_begin,
        brush_thermal_pyro_render_dab,
        brush_thermal_pyro_stroke_end
    },
    {
        "topographic_contour_isolines",
        "Topographic Contour Isolines",
        "Cartography",
        0.0500f,
        8.00f,
        160.00f,
        brush_topographic_contour_isolines_get_info,
        brush_topographic_contour_isolines_init,
        brush_topographic_contour_isolines_set_param,
        brush_topographic_contour_isolines_stroke_begin,
        brush_topographic_contour_isolines_render_dab,
        brush_topographic_contour_isolines_stroke_end
    },
    {
        "voronoi_mosaic",
        "Voronoi Crystal Stained Glass",
        "Cellular Geometry",
        0.0600f,
        8.00f,
        160.00f,
        brush_voronoi_mosaic_get_info,
        brush_voronoi_mosaic_init,
        brush_voronoi_mosaic_set_param,
        brush_voronoi_mosaic_stroke_begin,
        brush_voronoi_mosaic_render_dab,
        brush_voronoi_mosaic_stroke_end
    },
    {
        "watercolor_bleed",
        "Watercolor Bleed Wash",
        "Watercolor",
        0.0500f,
        6.00f,
        160.00f,
        brush_watercolor_bleed_get_info,
        brush_watercolor_bleed_init,
        brush_watercolor_bleed_set_param,
        brush_watercolor_bleed_stroke_begin,
        brush_watercolor_bleed_render_dab,
        brush_watercolor_bleed_stroke_end
    },
    {
        "wax_crayon",
        "Wax Crayon",
        "Sketch",
        0.0800f,
        2.00f,
        100.00f,
        brush_wax_crayon_get_info,
        brush_wax_crayon_init,
        brush_wax_crayon_set_param,
        brush_wax_crayon_stroke_begin,
        brush_wax_crayon_render_dab,
        brush_wax_crayon_stroke_end
    },
    {
        "xray_radiography_bone",
        "Skeletal X-Ray Radiography",
        "Medical FX",
        0.0500f,
        6.00f,
        140.00f,
        brush_xray_radiography_bone_get_info,
        brush_xray_radiography_bone_init,
        brush_xray_radiography_bone_set_param,
        brush_xray_radiography_bone_stroke_begin,
        brush_xray_radiography_bone_render_dab,
        brush_xray_radiography_bone_stroke_end
    },
};

static const native_filter_t s_filters[] = {
    {
        "bloom",
        "Bloom Glow",
        filter_bloom_get_info,
        filter_bloom_apply
    },
    {
        "blur",
        "Blur",
        filter_blur_get_info,
        filter_blur_apply
    },
    {
        "brightness",
        "Brightness",
        filter_brightness_get_info,
        filter_brightness_apply
    },
    {
        "chromatic",
        "Chromatic Aberration",
        filter_chromatic_get_info,
        filter_chromatic_apply
    },
    {
        "contrast",
        "Contrast",
        filter_contrast_get_info,
        filter_contrast_apply
    },
    {
        "dither",
        "Dither",
        filter_dither_get_info,
        filter_dither_apply
    },
    {
        "duotone",
        "Duotone Gradient",
        filter_duotone_get_info,
        filter_duotone_apply
    },
    {
        "edge",
        "Edge Detect",
        filter_edge_get_info,
        filter_edge_apply
    },
    {
        "emboss",
        "3D Emboss",
        filter_emboss_get_info,
        filter_emboss_apply
    },
    {
        "fisheye",
        "Fisheye Lens",
        filter_fisheye_get_info,
        filter_fisheye_apply
    },
    {
        "frosted_glass",
        "Frosted Glass",
        filter_frosted_glass_get_info,
        filter_frosted_glass_apply
    },
    {
        "glitch",
        "VHS Glitch",
        filter_glitch_get_info,
        filter_glitch_apply
    },
    {
        "grayscale",
        "Grayscale",
        filter_grayscale_get_info,
        filter_grayscale_apply
    },
    {
        "halftone_dot",
        "Halftone Screen Dots",
        filter_halftone_dot_get_info,
        filter_halftone_dot_apply
    },
    {
        "invert",
        "Invert",
        filter_invert_get_info,
        filter_invert_apply
    },
    {
        "kaleidoscope",
        "Kaleidoscope Lens",
        filter_kaleidoscope_get_info,
        filter_kaleidoscope_apply
    },
    {
        "kuwahara",
        "Oil Painting (Kuwahara)",
        filter_kuwahara_get_info,
        filter_kuwahara_apply
    },
    {
        "noise",
        "Noise",
        filter_noise_get_info,
        filter_noise_apply
    },
    {
        "pixelate",
        "Pixelate",
        filter_pixelate_get_info,
        filter_pixelate_apply
    },
    {
        "ripple",
        "Water Ripple Lens",
        filter_ripple_get_info,
        filter_ripple_apply
    },
    {
        "scanline",
        "CRT Scanlines",
        filter_scanline_get_info,
        filter_scanline_apply
    },
    {
        "sepia",
        "Sepia",
        filter_sepia_get_info,
        filter_sepia_apply
    },
    {
        "sharpen",
        "Sharpen (Unsharp Mask)",
        filter_sharpen_get_info,
        filter_sharpen_apply
    },
    {
        "solarize",
        "Solarize (Sabattier)",
        filter_solarize_get_info,
        filter_solarize_apply
    },
    {
        "swirl",
        "Swirl Vortex",
        filter_swirl_get_info,
        filter_swirl_apply
    },
    {
        "thermal",
        "Thermal Vision",
        filter_thermal_get_info,
        filter_thermal_apply
    },
    {
        "threshold",
        "Threshold",
        filter_threshold_get_info,
        filter_threshold_apply
    },
    {
        "vignette",
        "Vignette Lens",
        filter_vignette_get_info,
        filter_vignette_apply
    },
    {
        "water_foam",
        "Water & Shore Foam",
        filter_water_foam_get_info,
        filter_water_foam_apply
    },
};

int native_get_brush_count(void) {
    return (int)(sizeof(s_brushes) / sizeof(s_brushes[0]));
}

const native_brush_t *native_get_brush(int idx) {
    if (idx < 0 || idx >= native_get_brush_count()) return 0;
    return &s_brushes[idx];
}

const native_brush_t *native_find_brush(const char *id) {
    if (!id) return 0;
    for (int i = 0; i < native_get_brush_count(); i++) {
        if (strcmp(s_brushes[i].id, id) == 0) return &s_brushes[i];
    }
    return 0;
}

int native_get_filter_count(void) {
    return (int)(sizeof(s_filters) / sizeof(s_filters[0]));
}

const native_filter_t *native_get_filter(int idx) {
    if (idx < 0 || idx >= native_get_filter_count()) return 0;
    return &s_filters[idx];
}

const native_filter_t *native_find_filter(const char *id) {
    if (!id) return 0;
    for (int i = 0; i < native_get_filter_count(); i++) {
        if (strcmp(s_filters[i].id, id) == 0) return &s_filters[i];
    }
    return 0;
}
