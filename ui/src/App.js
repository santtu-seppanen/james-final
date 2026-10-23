import * as React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';

import Play from './socket';
import RecipeAdmin from './recipe-admin';
import BottleAdmin from './bottle-admin';
import BottleConfig from './bottle-config';
import RecipeConfig from './recipe-config';

const Stack = createStackNavigator();

function App() {
  const navigationRef = React.useRef(null);
  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator headerMode={false}>
        <Stack.Screen name="Home" component={Play} />
        <Stack.Screen name="BottleSetup" component={BottleAdmin} />
        <Stack.Screen name="RecipeSetup" component={RecipeAdmin} />
        <Stack.Screen name="SingleBottleConfig" component={BottleConfig} />
        <Stack.Screen name="SingleRecipeConfig" component={RecipeConfig} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default App;
