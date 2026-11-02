// deviceorientation alpha/beta/gamma → quaternion in the three.js world
// (y up), the convention of three's former DeviceOrientationControls. The
// phone's screen rotation is locked, so screen orientation is always 0.
import { Euler, Quaternion } from 'three';

const DEG = Math.PI / 180;
const euler = new Euler();
const qX = new Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // −90° around X

export function deviceQuat(out: Quaternion, alpha: number, beta: number, gamma: number) {
  euler.set(beta * DEG, alpha * DEG, -gamma * DEG, 'YXZ');
  return out.setFromEuler(euler).multiply(qX);
}
