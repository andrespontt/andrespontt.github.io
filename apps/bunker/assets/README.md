# Nomad cockpit crew model

`Soldier.glb` is the rigged Soldier model from the Three.js r160 example assets:
<https://github.com/mrdoob/three.js/blob/r160/examples/models/gltf/Soldier.glb>.
The Three.js animation example credits the model to Mixamo:
<https://github.com/mrdoob/three.js/blob/r160/examples/webgl_animation_skinning_blending.html>.
It is embedded in Bunker as fixed in-game cockpit crew, not offered as a model
download or asset pack.

# Dev intruder model

`Xbot.glb` is the rigged mannequin from the Three.js r160 example assets:
<https://github.com/mrdoob/three.js/blob/r160/examples/models/gltf/Xbot.glb>,
used in the Three.js additive animation blending example (Mixamo character and
animations). It is recolored at runtime as the civilian intruders in the dev
Perimeter scenario.

# Civilians

`people/Delivery_Male_01.glb` is the Delivery_Male_01 avatar from the Microsoft Rocketbox
library: <https://github.com/microsoft/Microsoft-Rocketbox> (MIT License, notice below).
It was converted from `Assets/Avatars/Professions/Delivery_Male_01/Export/Delivery_Male_01.fbx`
to glTF: metres, bones renamed from 3ds Max Biped to Mixamo names, matte PBR materials,
textures reduced to 1024 px (colour) and 512 px (normal) JPEG, specular maps and clips left
out. It plays the Xbot's idle, walk and run, converted to its skeleton at load time. It
appears as Tomas, a delivery driver waiting in the Veyr Transport reception.

    MIT License

    Copyright (c) 2020 Microsoft

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.

# City vehicles

`vehicles/*.glb` and `vehicles/Textures/colormap.png` are from the Car Kit (3.1) by Kenney
(www.kenney.nl), CC0 1.0 public domain: <https://opengameart.org/content/car-kit>.
Placed on the street in the dev City scenario (police cars, ambulance, parked and burned-out cars, cones).
