#include "quadro_brush_plugin.h"

static int _length = 36, _gravity = 85, _load = 72, _spread = 35;
const char* w_brush_get_info(void) {
  return "{\"name\":\"gravity_drip\",\"title\":\"Gravity Drip Paint\",\"category\":\"Paint Physics\",\"spacing\":0.04,\"minRadius\":3,\"maxRadius\":100,\"params\":[{\"name\":\"Drip Length\",\"min\":4,\"max\":100,\"default\":36,\"unit\":\"px\"},{\"name\":\"Gravity\",\"min\":0,\"max\":100,\"default\":85,\"unit\":\"%\"},{\"name\":\"Paint Load\",\"min\":10,\"max\":100,\"default\":72,\"unit\":\"%\"},{\"name\":\"Drip Spread\",\"min\":0,\"max\":100,\"default\":35,\"unit\":\"%\"}]}";
}
void w_brush_init(int w,int h) {}
void w_brush_set_param(int i,int v) { if(i==0)_length=v; else if(i==1)_gravity=v; else if(i==2)_load=v; else if(i==3)_spread=v; }
void w_brush_stroke_begin(float x,float y,float p,float tx,float ty,uint32_t c,int e) { w_brush_srand((uint32_t)(x*173+y*313+0x93471)); }
void w_brush_stroke_end(void) {}
void w_brush_render_dab(uint32_t *px,int w,int h,float cx,float cy,float r,float pressure,float angle,float speed,uint32_t color,int erase) {
 if(!px||w<1||h<1||r<1)return;
 int x0=(int)(cx-r-2),x1=(int)(cx+r+2),y0=(int)(cy-r-2),y1=(int)(cy+r+2); if(x0<0)x0=0;if(y0<0)y0=0;if(x1>=w)x1=w-1;if(y1>=h)y1=h-1;
 float grav=_gravity/100.0f, load=_load/100.0f, spread=_spread/100.0f, len=_length*(0.25f+0.75f*pressure);
 for(int y=y0;y<=y1;y++)for(int x=x0;x<=x1;x++){
  float dx=x-cx,dy=y-cy,d2=dx*dx+dy*dy;if(d2>r*r)continue;
  float edge=1.0f-d2/(r*r); float seed=edge*load*pressure;
  float drip=0;
  /* Drops form below loaded portions of the dab and thin toward their tips. */
  float start=cy+w_sqrtf((r*r-dx*dx)>0?(r*r-dx*dx):0)*0.45f;
  float down=y-start; if(down>0&&down<len*grav){
   float wobble=w_sinf(dx*0.23f+cx*0.07f)*spread*r*0.18f;
   float lateral=w_fabsf(dx-wobble); float width=(1.0f-down/(len*grav+1.0f))*(1.0f+spread*r*0.12f);
   if(lateral<width) drip=(1.0f-lateral/(width+0.01f))*(1.0f-down/(len*grav+1.0f))*load*pressure;
  }
  float a=seed>drip?seed:drip; if(a<0.015f)continue;
  uint32_t alpha=(uint32_t)(a*255.0f); if(alpha>255)alpha=255;
  uint32_t src=(color&0x00ffffffu)|(alpha<<24); uint32_t *p=&px[y*w+x];
  if(erase)*p=w_brush_erase(*p,src,255);else *p=w_brush_blend_over(src,*p,255);
 }
}
