import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableHighlight,
  TextInput,
  View,
  SafeAreaView,
  Picker,
  Switch,
  Image,
  ScrollView
} from 'react-native';
import InfoModal from './infoModal';

export default class RecipeConfig extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      errors: [],
      submitted: false,
      recipe: this.props.route.params.recipe
        ? this.props.route.params.recipe
        : {},
      modalMessage: '',
      modalVisible: false,
      servings: ['5', '10', '15', '20', '25', '30', '40', '50', '60', '70', '80', '90', '100'],
      images: [
        'humppaleka',
        'gin_tonic',
        'red_drink',
        'rum_coke',
        'vodka',
        'bluemargarita',
        'screwdriver',
        'mikahakkinen',
        'ginrickey',
        'tequila_sunrise',
        'moukku',
      ],
      bottlesPicker: [],
    };
  }

  componentWillReceiveProps(props) {
    this.setState({recipe: this.props.route.params.recipe});
  }

  componentDidMount() {
    this.getAvailableBottlesFromJames();

    this.getServingSizes();
  }

  getServingSizes = () => {
    let servings = [];
    for (let serving = 10; serving <= 150; serving = serving + 10) {
      servings.push(serving);
    }
    return servings;
  };

  getAvailableBottlesFromJames() {
    fetch('http://localhost:8000/getAvailableBottles')
      .then((response) => response.json())
      .then((body) => {
        this.setState({bottlesPicker: JSON.parse(body)});
      });

    this.setState({
      errors: [],
      submitted: false,
    });
  }

  setRecipesToJames(recipes) {
    fetch('http://localhost:8000/setRecipes', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(recipes),
    })
      .then((response) => response.json())
      .then((body) => {
        this.toggleModal('recipe updated');
      });

    this.setState({
      errors: [],
      submitted: false,
    });
  }

  toggleModal = (message) => {
    this.setState({
      modalMessage: message,
      modalVisible: true,
    });

    setTimeout(() => {
      this.setState({
        modalMessage: '',
        modalVisible: false,
      });
      this.props.navigation.goBack();
    }, 2000);
  };

  onChangeRecipeName = (name) => {
    const newRecipe = {...this.state.recipe, friendlyname: name};
    this.setState({recipe: newRecipe});
  };

  onChangeImageUrl = (imageUrl) => {
    const newRecipe = {...this.state.recipe, imageUrl: imageUrl};

    this.setState({recipe: newRecipe});
  };

  onChangeIngredient = (name, index) => {
    let recipe = {...this.state.recipe};

    recipe.ingredients[index].name = name;

    this.setState({
      recipe: recipe,
    });
  };

  onChangeServing = (serving, index) => {
    let recipe = {...this.state.recipe};

    recipe.ingredients[index].serving = serving;

    this.setState({
      recipe: recipe,
    });
  };

  removeIngredient = (index) => {
    let ingredients = [...this.state.recipe.ingredients];
    ingredients.splice(index, 1);

    this.setState({recipe: {...this.state.recipe, ingredients: ingredients}});
  };

  addIngredient = () => {
    let recipe = {...this.state.recipe};

    recipe.ingredients.push({
      name: 'vodka',
      serving: 10,
    });

    this.setState(recipe);
  };

  handleRecipeUpdate = () => {
    const recipe = this.state.recipe;
    const drinks = this.props.route.params.drinks;

    const errors = this.validateInputs(this.state.recipe);
    if (errors.length !== 0) {
      this.setState({
        errors: errors,
      });
    } else {
      let newRecipe = recipe.friendlyname === 'ADD NEW';

      if (newRecipe) {
        recipe.name = Date.now();
        recipe.friendlyname = recipe.ingredients[0].name;

        if (recipe.ingredients.length > 1) {
          recipe.friendlyname =
            recipe.friendlyname + ' & ' + recipe.ingredients[1].name;
        }

        drinks.push(recipe);
        this.setRecipesToJames(drinks);
      } else {
        const newDrinks = drinks.map((drink) => {
          if (drink.name === recipe.name) {
            return recipe;
          } else return drink;
        });

        this.setRecipesToJames(newDrinks);
      }
      this.setState({
        errors: [],
      });
    }
  };

  validateInputs = (recipe) => {
    let errors = [];
    let duplicates = [];

    if (!recipe.friendlyname) {
      errors.push('Recipe has no name');
    }

    if (recipe.ingredients.length === 0) {
      errors.push(`Recipe has no ingredients`);
    }

    recipe.ingredients.forEach((ingredient) => {
      if (duplicates[ingredient.name]) {
        errors.push(`Recipe has duplicate ingredients`);
      } else duplicates[ingredient.name] = true;
    });

    return errors;
  };

  toggleManualSwitch = (value, recipeIndex) => {
    let recipe = {...this.state.recipe};

    recipe.ingredients[recipeIndex].manual = !recipe.ingredients[recipeIndex]
      .manual;

    this.setState({
      recipe: recipe,
    });
  };

  render() {
    let recipe = this.state.recipe;
    return (
      <SafeAreaView
        style={{
          flex: 1,
        }}>
        <ScrollView
            style={styles.ingredientsContainer}
        >
        <View style={{padding: 20}}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Recipe name</Text>
            <TextInput
              style={{height: 40, borderColor: 'gray', borderWidth: 1}}
              onChangeText={(e) => this.onChangeRecipeName(e)}
              value={recipe.friendlyname}
            />
          </View>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Image</Text>
            <Picker
              selectedValue={recipe.imageUrl}
              style={{height: 50, width: 150}}
              onValueChange={(itemValue, itemIndex) => {
                this.onChangeImageUrl(itemValue);
              }}>
              {this.state.images.map((image) => {
                return <Picker.Item label={image} value={image} />;
              })}
            </Picker>
          </View>
            <Text style={[styles.label, {marginBottom: 20}]}>Ingredients</Text>
            {this.state.recipe.ingredients.map(
              (ingredient, ingredientIndex) => (
                <View style={styles.ingredientContainer}>
                  <Picker
                    selectedValue={ingredient.name}
                    style={{
                      height: 50,
                      width: 150,
                      marginBottom: 20,
                      marginRight: 10,
                    }}
                    onValueChange={(itemValue) => {
                      this.onChangeIngredient(itemValue, ingredientIndex);
                    }}>
                    {this.state.bottlesPicker.map((bottle) => {
                      return <Picker.Item label={bottle} value={bottle} />;
                    })}
                  </Picker>
                  <Picker
                    selectedValue={ingredient.serving}
                    style={{height: 50, width: 150, marginBottom: 20}}
                    onValueChange={(itemValue) => {
                      this.onChangeServing(itemValue, ingredientIndex);
                    }}>
                    {this.getServingSizes().map((serving) => {
                      return (
                        <Picker.Item label={`${serving}ml`} value={serving} />
                      );
                    })}
                  </Picker>
                  <View style={{paddingHorizontal: 20}}>
                    <Text style={{marginBottom: 10}}>Manual</Text>
                    <Switch
                      trackColor={{false: '#fff', true: '#0A84D0'}}
                      thumbColor={ingredient.manual ? '#0A84D0' : '#0A84D0'}
                      onValueChange={() =>
                        this.toggleManualSwitch(
                          ingredient.manual,
                          ingredientIndex,
                        )
                      }
                      value={ingredient.manual}
                    />
                  </View>
                  <TouchableHighlight
                    onLongPress={() => this.removeIngredient(ingredientIndex)}
                    style={[styles.button, {marginTop: 0}]}
                    underlayColor={'#0A84D0'}>
                    <Text style={styles.buttonText}>Remove</Text>
                  </TouchableHighlight>
                </View>
              ),
            )}
            <View style={{width: 100}}>
              <TouchableHighlight
                onPress={(event) => this.addIngredient()}
                underlayColor={'#0A84D0'}>
                <Image
                  source={require('./icons/plus.png')}
                  style={{
                    height: 20,
                    width: 20,
                  }}></Image>
              </TouchableHighlight>
            </View>
        </View>

        {this.state.errors.map((error) => (
          <View>
            <Text>{error}</Text>
          </View>
        ))}

        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            marginTop: 10,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
          <TouchableHighlight
            onPress={(event) => this.handleRecipeUpdate()}
            style={styles.button}
            underlayColor={'#0A84D0'}>
            <Text style={styles.buttonText}>Update</Text>
          </TouchableHighlight>
          <TouchableHighlight
            onPress={(event) => this.props.navigation.goBack()}
            style={styles.button}
            underlayColor={'#0A84D0'}>
            <Text style={styles.buttonText}>Cancel</Text>
          </TouchableHighlight>
        </View>
        <InfoModal
          visible={this.state.modalVisible}
          message={this.state.modalMessage}
          />
          </ScrollView>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  inputContainer: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  ingredientsContainer: {
    display: 'flex',
    marginBottom: 20,
    padding: 20,
    marginHorizontal: 20,
    height: 400,
  },
  ingredientContainer: {
    display: 'flex',
    flexDirection: 'row',
  },
  label: {
    width: 200,
    fontWeight: 'bold',
  },

  inputText: {
    height: 40,
    width: 200,
    borderColor: 'gray',
    borderWidth: 1,
  },
  button: {
    borderRadius: 3,
    padding: 20,
    marginVertical: 10,
    marginTop: 10,
    marginLeft: 10,
    backgroundColor: '#1B95E0',
    height: 60,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
